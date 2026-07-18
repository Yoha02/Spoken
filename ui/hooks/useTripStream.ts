"use client";

import { useEffect, useRef, useState } from "react";
import type { TripObject } from "@/core/tripObject";

export function useTripStream() {
  const [trip, setTrip] = useState<TripObject | null>(null);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/stream");
    sourceRef.current = source;

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (event) => {
      setTrip(JSON.parse(event.data));
    };

    return () => {
      source.close();
    };
  }, []);

  return { trip, connected };
}
