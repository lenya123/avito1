-- Analytics AI cache: stores GPT-4o-mini summaries and insights
-- TTL: 1 hour (checked via expires_at on read)

CREATE TABLE analytics_ai_cache (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  summary TEXT NOT NULL,
  insights JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, period_key)
);

-- RLS
ALTER TABLE analytics_ai_cache ENABLE ROW LEVEL SECURITY;

-- Service role handles all operations via createServiceClient
-- No user-facing policies needed (API route uses service client)
