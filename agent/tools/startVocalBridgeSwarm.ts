import { placeOutboundCall, getCallLog } from "@/agent/vocalbridge/client";
import { extractPreferences } from "@/agent/tools/extractPreferences";
import { simulateVocalBridgeSwarm } from "@/agent/tools/simulateSwarm";
import { applyDirectoryPhones } from "@/backend/intake/employeeDirectory";
import { mockBookItinerary } from "@/backend/sabre/mockBook";
import { isVocalBridgeCallsEnabled, vocalBridgeModeLabel } from "@/core/featureFlags";
import {
  appendTrace,
  appendTranscript,
  getTrip,
  updateTrip,
  type Traveler,
} from "@/core/tripObject";

export const START_VOCAL_BRIDGE_SWARM_TOOL = {
  name: "start_vocal_bridge_swarm",
  description:
    "Call each listed employee via Vocal Bridge to collect travel preferences (origin airport, seat, diet) for a company trip.",
} as const;

export type SwarmTravelerInput = {
  id: string;
  name: string;
  phone: string;
};

export type StartVocalBridgeSwarmInput = {
  purpose?: string;
  dest?: string;
  dateRange?: [string, string];
  travelers: SwarmTravelerInput[];
};

export type SwarmCallResult = {
  travelerId: string;
  name: string;
  phone: string;
  callId?: string;
  status: string;
  ok: boolean;
  error?: string;
};

export type StartVocalBridgeSwarmResult = {
  ok: boolean;
  calls: SwarmCallResult[];
};

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
}

function purposeLine(input: StartVocalBridgeSwarmInput): string {
  const dest = input.dest || getTrip().dest || "the destination";
  const range = input.dateRange ?? getTrip().dateRange;
  const dates =
    range?.[0] && range?.[1] ? `${range[0]} to ${range[1]}` : "the scheduled dates";
  return (
    input.purpose ||
    `Collect travel preferences for company trip to ${dest} (${dates}): origin airport, seat preference, dietary restriction.`
  );
}

function setTravelerStatus(travelerId: string, callStatus: Traveler["callStatus"]) {
  const trip = getTrip();
  const travelers = trip.travelers.map((t) =>
    t.id === travelerId ? { ...t, callStatus } : t
  );
  updateTrip({ travelers });
}

/**
 * Re-scans a traveler's accumulated transcript for origin/seat/diet and
 * writes back only fields not already set. Returns the newly-discovered
 * fields (empty object if nothing new) so the caller can log what changed.
 */
function applyDiscoveredPreferences(travelerId: string): Partial<Traveler> {
  const trip = getTrip();
  const traveler = trip.travelers.find((t) => t.id === travelerId);
  if (!traveler) return {};

  const found = extractPreferences(traveler.transcript);
  const newly: Partial<Traveler> = {};
  if (found.origin && !traveler.origin) newly.origin = found.origin;
  if (found.seat && !traveler.seat) newly.seat = found.seat;
  if (found.diet && !traveler.diet) newly.diet = found.diet;

  if (Object.keys(newly).length === 0) return {};

  const travelers = trip.travelers.map((t) => (t.id === travelerId ? { ...t, ...newly } : t));
  updateTrip({ travelers });
  return newly;
}

/**
 * Tool invoked after Landing AI extracts who must travel.
 * Places parallel outbound Vocal Bridge calls (live) or simulates them when
 * VOCALBRIDGE_CALLS_ENABLED is false (test mode) — see core/featureFlags.ts.
 */
export async function startVocalBridgeSwarm(
  input: StartVocalBridgeSwarmInput
): Promise<StartVocalBridgeSwarmResult & { mode: "live" | "test"; booked?: ReturnType<typeof mockBookItinerary> }> {
  const purpose = purposeLine(input);
  // Prefer live directory phones over any stale seed / cached numbers.
  const refreshed = applyDirectoryPhones(
    input.travelers.map((t) => ({
      id: t.id,
      name: t.name,
      phone: t.phone,
      callStatus: "idle" as const,
      transcript: [],
    }))
  );
  // Live mode requires real E.164 phones; test mode can proceed without dialable numbers.
  const travelers = (
    isVocalBridgeCallsEnabled()
      ? refreshed.filter((t) => t.name && t.phone)
      : refreshed.filter((t) => t.name)
  ).map((t) => ({
    id: t.id,
    name: t.name,
    phone: t.phone || `+1555000${Math.abs(hashId(t.id) % 10000)
      .toString()
      .padStart(4, "0")}`,
  }));

  if (travelers.length === 0) {
    appendTrace({
      ts: Date.now(),
      server: "vocalbridge",
      fn: "start_vocal_bridge_swarm",
      arg: isVocalBridgeCallsEnabled()
        ? "no travelers with dialable phones"
        : "no travelers",
      ok: false,
    });
    return { ok: false, calls: [], mode: vocalBridgeModeLabel() };
  }

  // ── Test mode: no real dials; mock prefs + mock book → PayPal-ready ─────
  if (!isVocalBridgeCallsEnabled()) {
    // Fresh iteration: drop any prior split so Approve & send can run again.
    if (getTrip().split?.length) {
      updateTrip({ split: undefined });
    }

    const results = await simulateVocalBridgeSwarm(travelers, purpose);
    const booked = mockBookItinerary("after simulated Vocal Bridge swarm");
    return {
      ok: results.some((r) => r.ok),
      calls: results,
      mode: "test",
      booked,
    };
  }

  // ── Live mode: real Vocal Bridge outbound calls ─────────────────────────
  appendTrace({
    ts: Date.now(),
    server: "vocalbridge",
    fn: "start_vocal_bridge_swarm",
    arg: `${travelers.length} travelers — LIVE — ${purpose.slice(0, 70)}`,
    ok: true,
  });

  // Mark all ringing before fan-out so the UI updates immediately.
  for (const t of travelers) setTravelerStatus(t.id, "ringing");

  const results = await Promise.all(
    travelers.map(async (t): Promise<SwarmCallResult> => {
      try {
        const call = await placeOutboundCall({ phoneNumber: t.phone, name: t.name, travelerId: t.id });
        setTravelerStatus(t.id, "live");
        appendTranscript(
          t.id,
          `[system] Outbound call started (${call.callId ?? "pending"}) — ${purpose.slice(0, 120)}`
        );
        appendTrace({
          ts: Date.now(),
          server: "vocalbridge",
          fn: "placeOutboundCall",
          arg: `${t.name} ${t.phone}`,
          ok: true,
        });

        // Fire-and-forget: poll session log for transcript snippets (demo-friendly).
        if (call.callId) {
          void pollTranscript(t.id, call.callId);
        }

        return {
          travelerId: t.id,
          name: t.name,
          phone: t.phone,
          callId: call.callId,
          status: call.status ?? "live",
          ok: true,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "call failed";
        setTravelerStatus(t.id, "failed");
        appendTranscript(t.id, `[system] Call failed: ${message}`);
        appendTrace({
          ts: Date.now(),
          server: "vocalbridge",
          fn: "placeOutboundCall",
          arg: `${t.name}: ${message.slice(0, 80)}`,
          ok: false,
        });
        return {
          travelerId: t.id,
          name: t.name,
          phone: t.phone,
          status: "failed",
          ok: false,
          error: message,
        };
      }
    })
  );

  const ok = results.some((r) => r.ok);
  return { ok, calls: results, mode: "live" };
}

/** Poll Vocal Bridge logs a few times and append new transcript text. */
async function pollTranscript(travelerId: string, sessionId: string) {
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) {
    await sleep(8_000);
    try {
      const log = await getCallLog(sessionId, travelerId);
      const status = String(log.status ?? log.call_status ?? "").toLowerCase();
      const text =
        (log.transcript_text as string) ||
        (Array.isArray(log.transcript)
          ? (log.transcript as { text?: string; role?: string }[])
              .map((line) =>
                typeof line === "string"
                  ? line
                  : `[${line.role ?? "party"}] ${line.text ?? ""}`
              )
              .join("\n")
          : "");

      let gotNewLine = false;
      if (text) {
        for (const line of text.split("\n").filter(Boolean)) {
          if (seen.has(line)) continue;
          seen.add(line);
          appendTranscript(travelerId, line);
          gotNewLine = true;
        }
      }

      if (gotNewLine) {
        const newly = applyDiscoveredPreferences(travelerId);
        if (Object.keys(newly).length > 0) {
          const parts = [newly.origin, newly.seat, newly.diet].filter(Boolean);
          appendTrace({
            ts: Date.now(),
            server: "vocalbridge",
            fn: "constraint_saved",
            arg: `${travelerId}: ${parts.join(" · ")}`,
            ok: true,
          });
        }
      }

      if (["completed", "done", "ended", "failed"].includes(status)) {
        setTravelerStatus(
          travelerId,
          status === "failed" ? "failed" : "done"
        );
        break;
      }
    } catch {
      // ignore transient poll errors
    }
  }

  // If still live after polling window, leave as live (operator can refresh).
  const t = getTrip().travelers.find((x) => x.id === travelerId);
  if (t?.callStatus === "live" && seen.size > 0) {
    setTravelerStatus(travelerId, "done");
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
