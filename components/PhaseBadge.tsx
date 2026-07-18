import { PHASE_COLOR_VAR, PHASE_LABEL, type TripPhase } from "@/lib/tripPhase";

export function PhaseBadge({ phase }: { phase: TripPhase }) {
  const color = PHASE_COLOR_VAR[phase];
  return (
    <span
      key={phase}
      className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-display text-xs uppercase tracking-[0.15em] animate-pop-in"
      style={{ borderColor: color, color }}
    >
      <span
        className={`h-2 w-2 rounded-full ${phase === "disrupted" || phase === "planning" ? "animate-pulse-dot" : ""}`}
        style={{ backgroundColor: color }}
      />
      {PHASE_LABEL[phase]}
    </span>
  );
}
