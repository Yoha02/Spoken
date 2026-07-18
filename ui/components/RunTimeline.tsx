import type { TripObject } from "@/core/tripObject";
import type { TripPhase } from "@/ui/lib/tripPhase";

/** Completed stages the user can revisit as historical context. */
export type RecapStage = "intake" | "calls" | "booking" | "verification";

type StageId = RecapStage | "confirmed";
type StageState = "upcoming" | "active" | "done";

const STAGES: { id: StageId; label: string; sponsor: string }[] = [
  { id: "intake", label: "Intake", sponsor: "LandingAI" },
  { id: "calls", label: "Calls", sponsor: "Vocal Bridge" },
  { id: "booking", label: "Booking", sponsor: "Sabre" },
  { id: "verification", label: "Verification", sponsor: "PayPal" },
  { id: "confirmed", label: "Confirmed", sponsor: "Spoken" },
];

/** Derives each stage purely from live trip state — never manually set. */
function stageStates(trip: TripObject, phase: TripPhase): Record<StageId, StageState> {
  const intake: StageState = trip.dest ? "done" : "active";

  const callsLive = trip.travelers.some(
    (t) => t.callStatus === "ringing" || t.callStatus === "live"
  );
  const callsDone = trip.travelers.some((t) => t.callStatus === "done");
  const calls: StageState = callsLive ? "active" : callsDone ? "done" : "upcoming";

  const allBooked = trip.legs.length > 0 && trip.legs.every((l) => l.status === "booked");
  const booking: StageState = allBooked ? "done" : trip.legs.length > 0 ? "active" : "upcoming";

  const verification: StageState =
    phase === "paid" ? "done" : phase === "awaiting_payment" ? "active" : "upcoming";

  const confirmed: StageState = phase === "paid" ? "done" : "upcoming";

  return { intake, calls, booking, verification, confirmed };
}

const DOT_COLOR: Record<StageState, string> = {
  upcoming: "var(--muted)",
  active: "var(--amber)",
  done: "var(--success)",
};

export function RunTimeline({
  trip,
  phase,
  activeRecap,
  onSelect,
}: {
  trip: TripObject;
  phase: TripPhase;
  activeRecap: RecapStage | null;
  onSelect: (stage: RecapStage) => void;
}) {
  const states = stageStates(trip, phase);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-bg/90 px-8 py-4 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center">
        {STAGES.map((stage, i) => {
          const state = states[stage.id];
          const clickable =
            stage.id !== "confirmed" &&
            (state === "done" || (stage.id === "verification" && state === "active"));
          const selected = activeRecap === stage.id;
          const labelTone =
            state === "upcoming" ? "text-muted" : selected ? "text-amber" : "text-paper";

          return (
            <div key={stage.id} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onSelect(stage.id as RecapStage)}
                className={`group flex flex-col items-center gap-1 rounded-lg border px-4 py-2 transition-all ${
                  clickable
                    ? `cursor-pointer bg-panel/60 hover:-translate-y-0.5 hover:border-amber hover:bg-panel ${
                        selected ? "border-amber" : "border-hairline"
                      }`
                    : "cursor-default border-transparent"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={`h-3 w-3 rounded-full ${state === "active" ? "animate-pulse-dot" : ""}`}
                    style={{
                      backgroundColor: state === "upcoming" ? "transparent" : DOT_COLOR[state],
                      boxShadow: `0 0 0 1.5px ${DOT_COLOR[state]}`,
                    }}
                  />
                  <span
                    className={`font-mono text-sm uppercase tracking-widest transition-colors ${labelTone} ${
                      clickable ? "group-hover:text-amber" : ""
                    }`}
                  >
                    {stage.label}
                  </span>
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted/80">
                  {stage.sponsor}
                </span>
              </button>

              {i < STAGES.length - 1 && (
                <span
                  className="mx-2 h-px flex-1 transition-colors"
                  style={{
                    backgroundColor: state === "done" ? "var(--success)" : "var(--hairline)",
                    opacity: state === "done" ? 0.5 : 1,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
