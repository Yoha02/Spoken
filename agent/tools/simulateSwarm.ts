import {
  appendTrace,
  appendTranscript,
  getRunGeneration,
  getTrip,
  updateTrip,
  type Traveler,
} from "@/core/tripObject";
import { isPreviewFast } from "@/core/featureFlags";
import type { SwarmCallResult, SwarmTravelerInput } from "@/agent/tools/startVocalBridgeSwarm";

/**
 * Preview call scripts — mirror the real Vocal Bridge agent prompts
 * (connect → availability → origin flexibility → seat → ground transport →
 * diet → close). The lines are call *highlights*, not verbatim transcript:
 * they read like facts the agent captured, and they drive extractable prefs.
 *
 * `gapMs` paces the highlight cadence so each call runs ~30–40s total
 * (ring 2.5s + connect 2.6s + lines + wrap 1.5s).
 */
const CALL_SCRIPTS: Record<
  string,
  { origin: string; seat: NonNullable<Traveler["seat"]>; diet: string; gapMs: number; lines: string[] }
> = {
  nikhil: {
    origin: "SFO",
    seat: "window",
    diet: "none",
    gapMs: 4000,
    lines: [
      "Call connected — briefed on the team trip plan",
      "Confirmed availability for the trip dates",
      "Home airport San Jose — open to SFO or Oakland for a nonstop",
      "Window seat preferred",
      "Uber pickup confirmed: Fremont home address",
      "No dietary restrictions for the group dinner",
      "All details captured — confirmation will be emailed",
    ],
  },
  eyoha: {
    origin: "SFO",
    seat: "aisle",
    diet: "vegetarian",
    gapMs: 5200,
    lines: [
      "Call connected — briefed on the team trip plan",
      "Confirmed availability for the trip dates",
      "Flying from San Francisco — Oakland works too",
      "Aisle seat preferred",
      "Hotel and airport Uber handled by Spoken — acknowledged",
      "Vegetarian for the group dinner",
      "All details captured — confirmation will be emailed",
    ],
  },
  ravi: {
    origin: "SFO",
    seat: "aisle",
    diet: "vegetarian",
    gapMs: 4800,
    lines: [
      "Call connected — briefed on the team trip plan",
      "Confirmed availability for the trip dates",
      "Flying from San Francisco",
      "Aisle seat preferred",
      "Vegetarian for the group dinner",
      "All details captured — confirmation will be emailed",
    ],
  },
  aashna: {
    origin: "SJC",
    seat: "window",
    diet: "none",
    gapMs: 4800,
    lines: [
      "Call connected — briefed on the team trip plan",
      "Confirmed availability for the trip dates",
      "Flying from San Jose",
      "Window seat preferred",
      "No dietary restrictions for the group dinner",
      "All details captured — confirmation will be emailed",
    ],
  },
};

const ORIGIN_FALLBACKS = ["SFO", "SJC", "OAK"];

function scriptFor(traveler: SwarmTravelerInput, index: number) {
  const known = CALL_SCRIPTS[traveler.id];
  if (known) return known;
  const origin = ORIGIN_FALLBACKS[index % ORIGIN_FALLBACKS.length];
  const seat: NonNullable<Traveler["seat"]> = index % 2 === 0 ? "aisle" : "window";
  return {
    origin,
    seat,
    diet: "none",
    gapMs: 4800,
    lines: [
      "Call connected — briefed on the team trip plan",
      "Confirmed availability for the trip dates",
      `Flying from ${origin}`,
      `${seat === "aisle" ? "Aisle" : "Window"} seat preferred`,
      "No dietary restrictions for the group dinner",
      "All details captured — confirmation will be emailed",
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
  const scale = isPreviewFast() ? 0.02 : 1;
  return new Promise((r) => setTimeout(r, Math.max(10, Math.round(ms * scale))));
}

/**
 * Preview swarm: no Vocal Bridge HTTP. Paces ringing → live → call highlights →
 * done so the dashboard plays like a real parallel swarm, and writes the same
 * prefs (origin/seat/diet) the live transcript parser would.
 */
export async function simulateVocalBridgeSwarm(
  travelers: SwarmTravelerInput[],
  purpose: string,
  runGen?: number
): Promise<SwarmCallResult[]> {
  // A newer run (re-trigger) invalidates this one; stop writing immediately.
  const stale = () => runGen !== undefined && getRunGeneration() !== runGen;

  appendTrace({
    ts: Date.now(),
    server: "vocalbridge",
    fn: "start_vocal_bridge_swarm",
    arg: `${travelers.length} travelers — ${purpose.slice(0, 70)}`,
    ok: true,
  });

  for (const t of travelers) {
    setTraveler(t.id, { callStatus: "idle", transcript: [], origin: undefined, seat: undefined, diet: undefined });
  }

  const results: SwarmCallResult[] = [];

  await Promise.all(
    travelers.map(async (t, index) => {
      const script = scriptFor(t, index);
      const callId = `vb-${t.id}-${Date.now().toString(36)}`;

      // Stagger dials so calls overlap like a real fan-out.
      await sleep(600 + index * 2200);
      if (stale()) return;
      setTraveler(t.id, { callStatus: "ringing" });
      appendTrace({
        ts: Date.now(),
        server: "vocalbridge",
        fn: "placeOutboundCall",
        arg: `${t.name} ${t.phone}`,
        ok: true,
      });

      await sleep(2500);
      if (stale()) return;
      setTraveler(t.id, { callStatus: "live" });

      for (let i = 0; i < script.lines.length; i++) {
        await sleep(i === 0 ? 2600 : script.gapMs);
        if (stale()) return;
        appendTranscript(t.id, script.lines[i]);
      }

      await sleep(1500);
      if (stale()) return;
      setTraveler(t.id, {
        callStatus: "done",
        origin: script.origin,
        seat: script.seat,
        diet: script.diet,
      });

      appendTrace({
        ts: Date.now(),
        server: "vocalbridge",
        fn: "constraint_saved",
        arg: `${t.id}: ${script.origin} · ${script.seat} · ${script.diet}`,
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
