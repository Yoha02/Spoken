"use client";

import { useEffect, useState } from "react";

/** Format on the client only — server/client timezones make toLocaleTimeString unsafe during SSR. */
export function MonoTimestamp({ ts, className = "" }: { ts: number; className?: string }) {
  const [str, setStr] = useState<string | null>(null);

  useEffect(() => {
    setStr(
      new Date(ts).toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    );
  }, [ts]);

  return (
    <span className={`font-mono text-[11px] text-muted ${className}`} suppressHydrationWarning>
      {str ?? "\u00a0\u00a0:\u00a0\u00a0:\u00a0\u00a0"}
    </span>
  );
}
