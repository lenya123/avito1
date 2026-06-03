"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

interface UseRealtimeInvalidationOptions {
  /** Channel name (must be unique per subscription) */
  channel: string;
  /** Tables to subscribe to (all events, public schema) */
  tables: string[];
  /** React Query keys to invalidate on change */
  queryKeys: string[][];
  /** Debounce interval in ms (default: 300) */
  debounceMs?: number;
  /** Enable/disable the subscription */
  enabled?: boolean;
}

export function useRealtimeInvalidation({
  channel: channelName,
  tables,
  queryKeys,
  debounceMs = 300,
  enabled = true,
}: UseRealtimeInvalidationOptions) {
  const queryClient = useQueryClient();
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryKeysRef = useRef(queryKeys);
  queryKeysRef.current = queryKeys;

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();

    const handleChange = () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      debounceTimer.current = setTimeout(() => {
        for (const key of queryKeysRef.current) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }, debounceMs);
    };

    const channel = supabase.channel(channelName);

    for (const table of tables) {
      channel.on(
        "postgres_changes" as const,
        { event: "*" as const, schema: "public", table },
        handleChange
      );
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (process.env.NODE_ENV === "development") {
          console.log(`[Realtime] ${channelName}: subscribed`);
        }
      }
      if (status === "CHANNEL_ERROR") {
        console.error(`[Realtime] ${channelName}: channel error`);
      }
    });

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      supabase.removeChannel(channel);
    };
  }, [channelName, tables, debounceMs, enabled, queryClient]);
}
