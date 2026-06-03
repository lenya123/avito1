#!/bin/bash
curl -sS -c /tmp/cj -X POST -H "Content-Type: application/json" \
  -d '{"siteKey":"a8d3e2f1c5b497602d3e8f4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8"}' \
  -o /dev/null http://localhost:3000/api/owner/auth/login

echo "=== endpoints ==="
for ep in \
  "/api/avito/accounts" \
  "/api/avito/session?accountIndex=1" \
  "/api/avito/overview?accountIndex=1" \
  "/api/avito/items?page=1&perPage=6" \
  "/api/avito/orders?page=1&limit=3" \
  "/api/avito/chats?page=1&limit=4" \
  "/api/avito/reviews?offset=0&limit=3" \
  "/api/avito/operations?accountIndex=1" \
  "/api/avito/ai-agent/status?accountIndex=1" \
  "/api/avito/products?search=&enabled=true" \
  ; do
  T=$(curl -sS -b /tmp/cj --max-time 15 -o /dev/null -w "%{http_code} %{time_total}s" "http://localhost:3000$ep")
  printf "  %-50s  %s\n" "$ep" "$T"
done
