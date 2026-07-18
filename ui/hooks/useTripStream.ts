"use client";

import { useEffect, useRef, useState } from "react";
import type { TripObject } from "@/core/tripObject";

export function useTripStream() {
  const [trip, setTrip] = useState<TripObject | null>(null);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // EventSource is browser-only; never open during SSR.
    const source = new EventSource("/api/stream");
    sourceRef.current = source;

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (event) => {
      try {
        setTrip(JSON.parse(event.data) as TripObject);
      } catch {
        // Ignore malformed SSE payloads rather than crashing the panel.
      }
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, []);

  return { trip, connected };
}
