import {
  appendTrace,
  appendTranscript,
  getTrip,
  updateTrip,
  type Traveler,
} from "@/core/tripObject";
import type { SwarmCallResult, SwarmTravelerInput } from "@/agent/tools/startVocalBridgeSwarm";

/** Deterministic demo prefs so extractPreferences / booking stay stable across runs. */
const MOCK_PREFS: Record<
  string,
  { origin: string; seat: NonNullable<Traveler["seat"]>; diet: string; lines: string[] }
> = {
  ravi: {
    origin: "SFO",
    seat: "aisle",
    diet: "vegetarian",
    lines: [
      "Hey — Austin sounds great.",
      "I'll fly out of SFO.",
      "Aisle seat, and I'm vegetarian.",
    ],
  },
  aashna: {
    origin: "SJC",
    seat: "window",
    diet: "none",
    lines: [
      "Yes, I can do those dates.",
      "Flying from SJC if it's cheaper.",
      "Window seat please, no dietary restrictions.",
    ],
  },
  nikhil: {
    origin: "LAX",
    seat: "aisle",
    diet: "gluten-free",
    lines: [
      "Works for me.",
      "I'll depart from LAX.",
      "Aisle, and I need gluten-free meals.",
    ],
  },
  eyoha: {
    origin: "OAK",
    seat: "window",
    diet: "none",
    lines: [
      "I'm in — OAK is easiest.",
      "Window seat if you can.",
      "No food restrictions.",
    ],
  },
};

const ORIGIN_FALLBACKS = ["SFO", "SJC", "OAK", "LAX"];

function prefsFor(traveler: SwarmTravelerInput, index: number) {
  const known = MOCK_PREFS[traveler.id];
  if (known) return known;
  const origin = ORIGIN_FALLBACKS[index % ORIGIN_FALLBACKS.length];
  const seat: NonNullable<Traveler["seat"]> = index % 2 === 0 ? "aisle" : "window";
  return {
    origin,
    seat,
    diet: "none",
    lines: [
      `Sounds good for the trip.`,
      `I'll fly out of ${origin}.`,
      `${seat === "aisle" ? "Aisle" : "Window"} seat, no dietary restrictions.`,
    ],
  };
}

function setTraveler(travelerId: string, patch: Partial<Traveler>) {
  const travelers = getTrip().travelers.map((t) =>
    t.id === travelerId ? { ...t, ...patch } : t
  );
  updateTrip({ travelers });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Test-mode swarm: no Vocal Bridge HTTP. Stages ringing → live → transcript →
 * done with mock prefs so booking / PayPal can run without burning call quota.
 */
export async function simulateVocalBridgeSwarm(
  travelers: SwarmTravelerInput[],
  purpose: string
): Promise<SwarmCallResult[]> {
  appendTrace({
    ts: Date.now(),
    server: "vocalbridge",
    fn: "start_vocal_bridge_swarm",
    arg: `${travelers.length} travelers · TEST MODE (no real calls) — ${purpose.slice(0, 60)}`,
    ok: true,
  });

  for (const t of travelers) {
    setTraveler(t.id, { callStatus: "ringing", transcript: [] });
  }

  const results: SwarmCallResult[] = [];

  // Stagger so the UI shows parallel-ish progress rather than an instant snap.
  await Promise.all(
    travelers.map(async (t, index) => {
      const prefs = prefsFor(t, index);
      const callId = `sim-${t.id}-${Date.now()}`;

      await sleep(200 + index * 150);
      setTraveler(t.id, { callStatus: "live" });
      appendTranscript(t.id, `[system] Simulated outbound call started (${callId})`);
      appendTrace({
        ts: Date.now(),
        server: "vocalbridge",
        fn: "placeOutboundCall",
        arg: `${t.name} ${t.phone} · simulated`,
        ok: true,
      });

      for (let i = 0; i < prefs.lines.length; i++) {
        await sleep(350 + i * 120);
        appendTranscript(t.id, prefs.lines[i]);
      }

      setTraveler(t.id, {
        callStatus: "done",
        origin: prefs.origin,
        seat: prefs.seat,
        diet: prefs.diet,
      });

      appendTrace({
        ts: Date.now(),
        server: "vocalbridge",
        fn: "constraint_saved",
        arg: `${t.id}: ${prefs.origin} · ${prefs.seat} · ${prefs.diet}`,
        ok: true,
      });

      results.push({
        travelerId: t.id,
        name: t.name,
        phone: t.phone,
        callId,
        status: "done",
        ok: true,
      });
    })
  );

  return results;
}
