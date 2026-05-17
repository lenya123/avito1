#!/bin/bash
# Загрузка контекста при старте/возобновлении сессии
# Хук: SessionStart

HANDOFF="$CLAUDE_PROJECT_DIR/.claude/handoff.md"

if [ -f "$HANDOFF" ]; then
  cat "$HANDOFF"
fi

exit 0
