"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE";

/**
 * Subscribe to Supabase Realtime changes on a table.
 * Automatically cleans up on unmount.
 */
export function useRealtime(
  table: string,
  callback: (payload: {
    eventType: RealtimeEvent;
    new: Record<string, unknown>;
    old: Record<string, unknown>;
  }) => void,
  filter?: string
) {
  useEffect(() => {
    const supabase = createClient();

    let channel = supabase
      .channel(`realtime-${table}`)
      .on(
        "postgres_changes" as "system",
        {
          event: "*",
          schema: "public",
          table: table,
          ...(filter ? { filter } : {}),
        } as Record<string, unknown>,
        (payload: Record<string, unknown>) => {
          callback({
            eventType: payload.eventType as RealtimeEvent,
            new: (payload.new as Record<string, unknown>) ?? {},
            old: (payload.old as Record<string, unknown>) ?? {},
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, callback]);
}
