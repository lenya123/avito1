#!/usr/bin/env bash
# Мягкая остановка dev-стека (Next.js + worker + 4 бота).
#
# Сначала SIGINT концерренти-родителю — он по --kill-others чисто
# останавливает всех детей. Если за GRACE секунд не отдал управление,
# добиваем по портам/паттернам tsx-watcher.
#
# Используется как первый шаг "п"-шортката (см. memory/shortcut_restart_server.md).
# После этого скрипта запускается `npm run dev:all` в фоне через Claude Code,
# а не в VS Code integrated terminal — так крах VS Code не валит dev-среду.

set -uo pipefail

GRACE=3

# Главный родитель — concurrently из npm run dev:all.
PARENT_PID=$(pgrep -f "concurrently --kill-others -n web,worker,bots" | head -1 || true)

if [[ -n "${PARENT_PID:-}" ]]; then
  echo "→ SIGINT to concurrently (pid=$PARENT_PID)…"
  kill -INT "$PARENT_PID" 2>/dev/null || true
  for i in $(seq 1 "$GRACE"); do
    if ! kill -0 "$PARENT_PID" 2>/dev/null; then
      echo "→ concurrently shut down cleanly in ${i}s"
      break
    fi
    sleep 1
  done
fi

# Hard cleanup на случай зависших чайлдов.
HOLDERS=$(lsof -ti:3000,3001 2>/dev/null || true)
if [[ -n "$HOLDERS" ]]; then
  echo "→ killing leftover port holders: $HOLDERS"
  echo "$HOLDERS" | xargs kill -9 2>/dev/null || true
fi

pkill -f "tsx.*scripts/(worker|dev-bots)" 2>/dev/null || true

echo "✓ stopped."
