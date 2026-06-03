-- Город товара
ALTER TABLE products ADD COLUMN location_city TEXT DEFAULT NULL;

-- Город по умолчанию в настройках владельца
ALTER TABLE settings ADD COLUMN default_location_city TEXT DEFAULT NULL;

-- Пункты отправки по городам (владелец назначает)
CREATE TABLE location_pickup_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL,
  pickup_point_id UUID NOT NULL REFERENCES pickup_points(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(city, pickup_point_id)
);

CREATE INDEX idx_location_pickup_city ON location_pickup_points(city);
