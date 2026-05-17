-- Enable Supabase Realtime for orders table
-- Shipper PWA subscribes to instant updates instead of 30-second polling
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;
END $$;

-- Allow anon role to receive Realtime events for orders
-- Needed because shipper auth is custom (cookie-based), not Supabase Auth
-- The actual data fetching goes through API routes with service role
-- Policy is limited to active operational statuses only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'orders_realtime_anon'
  ) THEN
    CREATE POLICY "orders_realtime_anon" ON orders FOR SELECT
      TO anon
      USING (status IN (
        'awaiting_shipment', 'collecting', 'problem',
        'in_transit', 'delivered_to_point', 'completed',
        'not_picked_up', 'return_in_transit', 'return_arrived'
      ));
  END IF;
END $$;
