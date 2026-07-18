import type { Traveler } from "@/core/tripObject";
import { StatusDot, callStatusStyle } from "./StatusDot";
import { Chip } from "./Chip";

export function SwarmStrip({ travelers }: { travelers: Traveler[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {travelers.map((t) => {
        const active = t.callStatus === "live" || t.callStatus === "ringing";
        const style = callStatusStyle(t.callStatus);
        const hasConstraints = t.origin || t.seat || (t.diet && t.diet !== "none");

        return (
          <div
            key={t.id}
            className={`animate-slide-in-up shrink-0 rounded-xl border bg-panel px-4 py-3 transition-all duration-300 ${
              active ? "min-w-[240px] border-2" : "min-w-[168px] border"
            }`}
            style={{ borderColor: active ? style.color : "var(--hairline)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-heading text-sm font-bold uppercase tracking-wide text-paper">{t.name}</span>
              <StatusDot status={t.callStatus} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {t.origin && <Chip tone="ice">{t.origin}</Chip>}
              {t.seat && <Chip tone="muted">{t.seat}</Chip>}
              {t.diet && t.diet !== "none" && <Chip tone="amber">{t.diet}</Chip>}
              {!hasConstraints && <span className="font-mono text-[11px] text-muted">No constraints yet</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
