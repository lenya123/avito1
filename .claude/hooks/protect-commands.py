#!/usr/bin/env python3
"""Защита от опасных команд. Хук: PreToolUse (Bash)

Блокирует только необратимые действия, актуальные для этого проекта.
~16 паттернов вместо 80+ — не мешает автономной работе.
"""

import sys
import json
import re

data = json.load(sys.stdin)
command = data.get("tool_input", {}).get("command", "")
if not command:
    sys.exit(0)

cmd = command.strip()

# Убираем содержимое heredoc-блоков (<<'EOF'...EOF), т.к. это просто текст
# (например, коммит-сообщения), а не исполняемые команды.
# Кавычки НЕ трогаем — bash -c "dangerous" должен по-прежнему ловиться.
cmd_clean = re.sub(
    r"\$\(cat\s+<<\s*'?\w+'?\s*\n.*?\n\s*\w+\s*\)",
    "HEREDOC",
    cmd,
    flags=re.DOTALL,
)

dangerous_patterns = [
    # ==========================================================
    # Git — необратимые операции
    # ==========================================================
    (r"git\s+push\s+.*--force", "Force push"),
    (r"git\s+push\s+.*\s-f\b", "Force push (-f)"),
    (r"git\s+push\s+.*--force-with-lease", "Force push with lease"),
    (r"git\s+reset\s+--hard", "git reset --hard"),
    (r"git\s+clean\s+-[a-z]*f", "git clean -f (удаление untracked файлов)"),
    (r"git\s+checkout\s+\.\s*($|[;&|])", "Сброс всех изменений (checkout .)"),
    (r"git\s+checkout\s+--\s+\.", "Сброс всех изменений (checkout -- .)"),
    (r"git\s+restore\s+\.\s*($|[;&|])", "Сброс всех изменений (restore .)"),
    (r"git\s+(commit|push)\s+.*--no-verify", "Обход хуков (--no-verify)"),
    (r"git\s+config\s+--global", "Изменение глобальной git конфигурации"),

    # ==========================================================
    # Файлы — только критические пути
    # ==========================================================
    # rm критических директорий (/, ~, .., .git) — НО НЕ rm -rf node_modules
    (r"rm\s+(-[a-z]*\s+)*(/\s|/\||/$|~|\.\.(\s|$|/)|\.git\b)", "Удаление критических директорий (/, ~, .., .git)"),
    # Перезапись конфигов пустотой
    (r">\s*\.env(\.\w+)?(\s*$|\s*[;&|])", "Перезапись .env файла"),
    (r">\s*package\.json\s*($|[;&|])", "Перезапись package.json"),
    (r">\s*tsconfig\.json", "Перезапись tsconfig.json"),
    (r">\s*next\.config", "Перезапись next.config"),
    (r">\s*\.gitignore", "Перезапись .gitignore"),

    # ==========================================================
    # БД — Supabase CLI доступен в проекте
    # ==========================================================
    (r"supabase\s+db\s+reset", "Supabase DB reset"),
    (r"(?i)drop\s+(table|database|schema)", "DROP TABLE/DATABASE/SCHEMA"),
    (r"(?i)truncate\s+table", "TRUNCATE TABLE"),
    (r"(?i)delete\s+from\s+\w+\s*;", "DELETE без WHERE"),

    # ==========================================================
    # Секреты — утечка наружу
    # ==========================================================
    (r"(cat|less|more|head|tail)\s+.*\.env.*\|\s*(curl|wget|nc)", "Отправка .env наружу"),
    (r"(env|printenv)\s*\|\s*(curl|wget|nc|ncat)", "Отправка env наружу"),
    (r"curl\s+.*\|\s*(bash|sh|zsh)", "curl | bash (выполнение скачанного кода)"),
    (r"wget\s+.*\|\s*(bash|sh|zsh)", "wget | sh (выполнение скачанного кода)"),

    # ==========================================================
    # Система
    # ==========================================================
    (r"\bsudo\b", "Выполнение с правами root"),
]

for pattern, reason in dangerous_patterns:
    if re.search(pattern, cmd_clean):
        result = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": f"Заблокировано: {reason}",
            }
        }
        print(json.dumps(result))
        sys.exit(0)

sys.exit(0)
