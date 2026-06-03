#!/bin/bash
# Автоформатирование файла после редактирования через Prettier
# Хук: PostToolUse (Edit|Write)

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('file_path', ''))
except:
    print('')
" 2>/dev/null)

# Нет пути или файл не существует — выходим
if [ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Форматируем только поддерживаемые типы файлов
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.css|*.scss|*.json|*.md|*.html|*.yaml|*.yml)
    npx prettier --write "$FILE_PATH" >/dev/null 2>&1
    ;;
esac

exit 0
