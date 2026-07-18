import type { TripObject } from "@/lib/tripObject";

export type FeedItem = {
  id: string;
  ts: number;
  text: string;
  ok: boolean;
};

// Friendlier phrasing for known server.fn combinations; falls back to a
// generic rendering for anything else so new appendTrace() calls from
// routes that don't have a mapping yet still show up sensibly.
const LABELS: Record<string, (arg: string, ok: boolean) => string> = {
  "gmail.getLatestTripEmail": (_arg, ok) => (ok ? "Read invite email" : "Gmail fetch failed"),
  "landingai.extractTripDetails": (arg, ok) =>
    ok ? `Extracted trip details — "${arg}"` : `Extraction fell back to heuristics — "${arg}"`,
  "sabre.getSabreToken": (_arg, ok) => (ok ? "Sabre: authenticated" : "Sabre: auth failed"),
};

export function buildActionFeed(trip: TripObject): FeedItem[] {
  return trip.toolTrace
    .map((entry, i) => {
      const key = `${entry.server}.${entry.fn}`;
      const label = LABELS[key];
      const text = label
        ? label(entry.arg, entry.ok)
        : `${entry.server}: ${entry.fn}${entry.arg ? ` — ${entry.arg}` : ""}`;
      return { id: `${entry.ts}-${i}`, ts: entry.ts, text, ok: entry.ok };
    })
    .sort((a, b) => b.ts - a.ts);
}
