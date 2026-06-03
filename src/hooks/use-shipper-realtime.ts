"use client";

import { useIsShipperAuthenticated } from "@/stores/shipper-auth-store";
import { useRealtimeInvalidation } from "./use-realtime-invalidation";

const TABLES = ["orders"];
const QUERY_KEYS = [["shipper-orders"], ["shipper-stock"], ["shipper-stats"]];

/**
 * Single Realtime subscription for the entire shipper PWA.
 * Call once in the shipper layout — invalidates orders, stock, and stats
 * whenever the `orders` table changes.
 */
export function useShipperRealtimeSubscription() {
  const isAuthenticated = useIsShipperAuthenticated();

  useRealtimeInvalidation({
    channel: "shipper-orders-realtime",
    tables: TABLES,
    queryKeys: QUERY_KEYS,
    enabled: isAuthenticated,
  });
}
