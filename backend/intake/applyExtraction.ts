import { resolveEmployees } from "@/backend/intake/employeeDirectory";
import type { ExtractedTripFields } from "@/backend/intake/landingai";
import { startVocalBridgeSwarm } from "@/agent/tools/startVocalBridgeSwarm";
import { appendTrace, updateTrip, type Traveler } from "@/core/tripObject";

export type ApplyExtractionOptions = {
  /** When true (default), auto-invoke Vocal Bridge after a successful extract. */
  autoSwarm?: boolean;
};

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
  if (matched.length > 0) patch.travelers = matched;

  updateTrip(patch);

  if (matched.length > 0) {
    appendTrace({
      ts: Date.now(),
      server: "intake",
      fn: "resolveEmployees",
      arg: matched.map((t) => t.name).join(", "),
      ok: true,
    });
  }

  let swarm: ApplyExtractionResult["swarm"];
  if (autoSwarm && matched.length > 0) {
    swarm = await startVocalBridgeSwarm({
      purpose:
        fields.purpose ||
        `Collect travel prefs for ${fields.dest || "trip"} — named by CEO`,
      dest: fields.dest,
      dateRange: fields.dateRange,
      travelers: matched.map((t) => ({
        id: t.id,
        name: t.name,
        phone: t.phone,
      })),
    });
  }

  return {
    fields,
    travelers: matched,
    unmatchedNames: unmatched,
    swarm,
  };
}
