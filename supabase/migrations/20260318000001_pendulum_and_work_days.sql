-- Pendulum system: work days per shipper + settings
-- work_days: array of integers 0-6 (0=Sunday, 1=Monday, ..., 6=Saturday)

-- Add work_days to users (for shippers)
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_days integer[] DEFAULT NULL;

-- Add pendulum settings to settings table
DO $$ BEGIN
  ALTER TABLE settings ADD COLUMN IF NOT EXISTS pendulum_rate_min numeric DEFAULT 100;
  ALTER TABLE settings ADD COLUMN IF NOT EXISTS pendulum_rate_base numeric DEFAULT 150;
  ALTER TABLE settings ADD COLUMN IF NOT EXISTS pendulum_rate_max numeric DEFAULT 250;
  ALTER TABLE settings ADD COLUMN IF NOT EXISTS pendulum_speed_target_hours numeric DEFAULT 24;
  ALTER TABLE settings ADD COLUMN IF NOT EXISTS pendulum_avg_window_days integer DEFAULT 7;
  ALTER TABLE settings ADD COLUMN IF NOT EXISTS min_work_days integer DEFAULT 4;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add check constraint: work_days values must be 0-6
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_work_days_valid;
ALTER TABLE users ADD CONSTRAINT users_work_days_valid
  CHECK (work_days IS NULL OR (
    array_length(work_days, 1) <= 7
    AND work_days <@ ARRAY[0,1,2,3,4,5,6]
  ));
