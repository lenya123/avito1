#!/bin/bash
# Защита от опасных команд — обёртка
# Хук: PreToolUse (Bash)
python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/protect-commands.py"
