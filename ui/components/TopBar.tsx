import type { TripObject } from "@/core/tripObject";
import type { TripPhase } from "@/ui/lib/tripPhase";
import { PhaseBadge } from "./PhaseBadge";
import { AnimatedNumber } from "./AnimatedNumber";

export function TopBar({ trip, phase }: { trip: TripObject; phase: TripPhase }) {
  const budgetTotal = trip.budgetPerPerson * trip.travelers.length;
  const overBudget = budgetTotal > 0 && trip.totalCost > budgetTotal;

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-5">
      <div>
        <h1 className="font-display text-2xl uppercase tracking-tight text-paper">
          Swarm Mode
          {trip.dest && <span className="text-amber"> · {trip.dest}</span>}
        </h1>
        <p className="mt-1 font-mono text-xs text-muted">
          {trip.dateRange[0] ? `${trip.dateRange[0]} → ${trip.dateRange[1]}` : "Dates pending"}
        </p>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-right">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted">Total vs. budget</p>
          <p className={`font-mono text-lg ${overBudget ? "text-signal" : "text-paper"}`}>
            <AnimatedNumber value={trip.totalCost} prefix="$" />
            {budgetTotal > 0 && <span className="text-muted"> / ${budgetTotal}</span>}
          </p>
        </div>
        <PhaseBadge phase={phase} />
      </div>
    </header>
  );
}
