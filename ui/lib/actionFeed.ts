import type { TripObject } from "@/core/tripObject";

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
  "gmail.getLatestTripEmail": (_arg, ok) =>
    ok ? "HR inbox: read CEO travel email" : "Gmail fetch failed",
  "gmail.triggerFromGmail": (arg, ok) =>
    ok ? `Gmail add-on triggered swarm — ${arg}` : `Gmail add-on trigger failed — ${arg}`,
  "landingai.extractTripDetails": (arg, ok) =>
    ok
      ? `Landing AI extracted trip details — "${arg}"`
      : `Landing AI fallback heuristics — "${arg}"`,
  "intake.resolveEmployees": (arg, ok) =>
    ok ? `Matched employees — ${arg}` : `Could not match employees — ${arg}`,
  "vocalbridge.start_vocal_bridge_swarm": (arg, ok) =>
    ok ? `Vocal Bridge swarm started — ${arg}` : `Vocal Bridge swarm skipped — ${arg}`,
  "vocalbridge.placeOutboundCall": (arg, ok) =>
    ok ? `Vocal Bridge calling ${arg}` : `Vocal Bridge call failed — ${arg}`,
  "vocalbridge.constraint_saved": (arg) => `Constraint saved — ${arg}`,
  "sabre.getSabreToken": (_arg, ok) => (ok ? "Sabre: authenticated" : "Sabre: auth failed"),
  "sabre.shopFlights": (arg, ok) =>
    ok ? `Sabre flight search — ${arg}` : `Sabre flight search failed — ${arg}`,
  "sabre.shopHotels": (arg, ok) =>
    ok ? `Sabre hotel search — ${arg}` : `Sabre hotel search failed — ${arg}`,
  "sabre.holdFlight": (arg) => `Sabre fare held — ${arg}`,
  "sabre.holdHotel": (arg) => `Sabre hotel held — ${arg}`,
  "sabre.createBooking": (arg, ok) =>
    ok ? `Sabre booking confirmed — ${arg}` : `Sabre booking failed — ${arg}`,
  "sabre.priceItinerary": (arg) => `Itinerary priced — ${arg}`,
  "uber.quote": (arg) => `Uber quote — ${arg}`,
  "uber.scheduleRide": (arg, ok) =>
    ok ? `Uber scheduled — ${arg}` : `Uber scheduling failed — ${arg}`,
  "opentable.requestTable": (arg) => `Calling restaurant — ${arg}`,
  "opentable.reserve": (arg, ok) =>
    ok ? `Dinner reserved — ${arg}` : `Dinner reservation failed — ${arg}`,
  "paypal.createOrder": (arg, ok) =>
    ok ? `PayPal order created — ${arg}` : `PayPal order failed — ${arg}`,
  "paypal.captureOrder": (arg, ok) =>
    ok ? `PayPal trip paid — ${arg}` : `PayPal capture failed — ${arg}`,
  "paypal.splitPayment": (arg, ok) =>
    ok ? `PayPal checkout ready — ${arg}` : `PayPal checkout failed — ${arg}`,
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
