import { getEmployeeDirectory, resolveEmployees } from "@/backend/intake/employeeDirectory";
import type { ExtractedTripFields } from "@/backend/intake/landingai";
import { startVocalBridgeSwarm } from "@/agent/tools/startVocalBridgeSwarm";
import { appendTrace, updateTrip, type Traveler } from "@/core/tripObject";

export type ApplyExtractionOptions = {
  /** When true (default), auto-invoke Vocal Bridge after a successful extract. */
  autoSwarm?: boolean;
};

// These two currently have real Vocal Bridge agents/credentials configured
// (see .env.local) — always include them in the swarm call whenever the
// destination updates, regardless of whether the CEO email happened to
// name them explicitly. Extend this list as more travelers get real creds.
const ALWAYS_CALL_IDS = ["nikhil", "eyoha"];

function withRequiredTravelers(matched: Traveler[]): Traveler[] {
  const directory = getEmployeeDirectory();
  const result = [...matched];
  for (const id of ALWAYS_CALL_IDS) {
    if (result.some((t) => t.id === id)) continue;
    const entry = directory.find((e) => e.id === id);
    if (entry) {
      result.push({ id: entry.id, name: entry.name, phone: entry.phone, callStatus: "idle", transcript: [] });
    }
  }
  return result;
}

export type ApplyExtractionResult = {
  fields: ExtractedTripFields;
  travelers: Traveler[];
  unmatchedNames: string[];
  swarm?: Awaited<ReturnType<typeof startVocalBridgeSwarm>>;
};

/**
 * Applies Landing AI fields to the shared TripObject, resolves employee phones,
 * and optionally starts the Vocal Bridge swarm tool (Landing AI → Vocal Bridge).
 */
export async function applyExtractionToTrip(
  fields: ExtractedTripFields,
  options: ApplyExtractionOptions = {}
): Promise<ApplyExtractionResult> {
  const { autoSwarm = true } = options;

  const { matched, unmatched } = resolveEmployees(fields.travelerNames ?? []);
  // Whenever the destination updates, make sure the travelers with real
  // configured Vocal Bridge creds are on the call list even if the source
  // text didn't happen to name them.
  const travelers = fields.dest ? withRequiredTravelers(matched) : matched;

  if (unmatched.length > 0) {
    appendTrace({
      ts: Date.now(),
      server: "intake",
      fn: "resolveEmployees",
      arg: `unmatched: ${unmatched.join(", ")}`,
      ok: false,
    });
  }

  const patch: Parameters<typeof updateTrip>[0] = {};
  if (fields.dest) patch.dest = fields.dest;
  if (fields.dateRange) patch.dateRange = fields.dateRange;
  if (fields.budgetPerPerson != null) patch.budgetPerPerson = fields.budgetPerPerson;
  if (travelers.length > 0) patch.travelers = travelers;

  updateTrip(patch);

  if (travelers.length > 0) {
    appendTrace({
      ts: Date.now(),
      server: "intake",
      fn: "resolveEmployees",
      arg: travelers.map((t) => t.name).join(", "),
      ok: true,
    });
  }

  let swarm: ApplyExtractionResult["swarm"];
  if (autoSwarm && travelers.length > 0) {
    swarm = await startVocalBridgeSwarm({
      purpose:
        fields.purpose ||
        `Collect travel prefs for ${fields.dest || "trip"} — named by CEO`,
      dest: fields.dest,
      dateRange: fields.dateRange,
      travelers: travelers.map((t) => ({
        id: t.id,
        name: t.name,
        phone: t.phone,
      })),
    });
  }

  return {
    fields,
    travelers,
    unmatchedNames: unmatched,
    swarm,
  };
}
