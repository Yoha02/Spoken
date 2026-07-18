"use client";

import { useEffect, useState } from "react";
import type { Leg, TripObject } from "@/core/tripObject";
import type { TripPhase } from "@/ui/lib/tripPhase";
import type { RecapStage } from "./RunTimeline";
import { StatusDot } from "./StatusDot";

function useElapsed(active: boolean): string {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [active]);

  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function describeLeg(leg: Leg): string {
  switch (leg.type) {
    case "flight":
      return `${leg.origin} → ${leg.dest} · ${leg.carrier} · $${leg.price}${leg.pnr ? ` · PNR ${leg.pnr}` : ""}`;
    case "hotel":
      return `${leg.name} · ${leg.checkIn} → ${leg.checkOut} · ${leg.rooms} room(s) · $${leg.price}`;
    case "dinner":
      return `${leg.place} · ${leg.time} · party of ${leg.partySize}${leg.notes ? ` · ${leg.notes}` : ""}`;
    case "ride":
      return leg.note;
  }
}

export function CenterStage({
  trip,
  phase,
  recap,
  onExitRecap,
}: {
  trip: TripObject;
  phase: TripPhase;
  recap?: RecapStage | null;
  onExitRecap?: () => void;
}) {
  const activeCaller = trip.travelers.find((t) => t.callStatus === "live");
  const ringingCaller = !activeCaller ? trip.travelers.find((t) => t.callStatus === "ringing") : undefined;
  const caller = activeCaller ?? ringingCaller;
  const elapsed = useElapsed(!!activeCaller && !recap);

  if (recap) {
    return <RecapView trip={trip} recap={recap} onExit={onExitRecap} />;
  }

  if (caller) {
    return (
      <div className="animate-fade-in flex h-full flex-col rounded-2xl border-2 bg-panel p-8" style={{ borderColor: "var(--signal)" }}>
        <div className="mb-4 flex items-center gap-3">
          <StatusDot status={caller.callStatus} size="lg" />
          <span className="font-mono text-sm uppercase tracking-widest text-signal">
            {activeCaller ? "Live call" : "Ringing"}
          </span>
          {activeCaller && <span className="ml-auto font-mono text-3xl tabular-nums text-paper">{elapsed}</span>}
        </div>
        <h2 className="font-display text-5xl uppercase tracking-tight text-paper">{caller.name}</h2>
        <p className="mt-1 font-mono text-sm text-muted">{caller.phone}</p>
        <div className="mt-6 flex-1 space-y-2 overflow-y-auto">
          {caller.transcript.length === 0 ? (
            <p className="font-mono italic text-muted">Connecting…</p>
          ) : (
            caller.transcript.slice(-6).map((line, i) => (
              <p key={i} className="animate-slide-in-up font-mono text-lg leading-relaxed text-paper">
                {line}
              </p>
            ))
          )}
        </div>
      </div>
    );
  }

  if (phase === "disrupted") {
    const failedLeg = trip.legs.find((l) => l.status === "failed");
    return (
      <div className="animate-fade-in flex h-full flex-col justify-center rounded-2xl border-2 border-signal bg-panel p-8">
        <span className="font-mono text-sm uppercase tracking-widest text-signal">Resolving disruption</span>
        <h2 className="mt-2 font-display text-4xl uppercase tracking-tight text-signal">
          {failedLeg && failedLeg.type === "dinner" ? failedLeg.place : "Leg"} unavailable
        </h2>
        <p className="mt-3 font-mono text-muted">
          {failedLeg && failedLeg.type === "dinner" && failedLeg.notes ? failedLeg.notes : "Agent is finding an alternative…"}
        </p>
      </div>
    );
  }

  if (phase === "paid") {
    return (
      <div className="animate-pop-in flex h-full flex-col items-center justify-center rounded-2xl border-2 border-success bg-panel p-8 text-center">
        <span className="font-display text-6xl uppercase tracking-tight text-success">Trip confirmed</span>
        <p className="mt-4 max-w-md font-mono text-lg leading-relaxed text-paper">
          Payments received. Every team member will get their confirmation by email.
        </p>
      </div>
    );
  }

  if (phase === "rebooked" || phase === "booked") {
    return (
      <div className="animate-pop-in flex h-full flex-col items-center justify-center rounded-2xl border-2 border-success bg-panel p-8">
        <span className="font-display text-6xl uppercase tracking-tight text-success">
          {phase === "rebooked" ? "Rebooked" : "Booked"}
        </span>
        <p className="mt-3 font-mono text-muted">
          {phase === "rebooked" ? "New plan locked in." : "Itinerary locked in."}
        </p>
      </div>
    );
  }

  return <PlanView trip={trip} title="Current plan" />;
}

/** Historical views for completed run stages — real data from this run only. */
function RecapView({
  trip,
  recap,
  onExit,
}: {
  trip: TripObject;
  recap: RecapStage;
  onExit?: () => void;
}) {
  if (recap === "booking") {
    return (
      <div className="relative h-full">
        <PlanView trip={trip} title="Itinerary" />
        <BackToLive onExit={onExit} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in relative flex h-full flex-col rounded-2xl border border-hairline bg-panel p-8">
      <BackToLive onExit={onExit} />

      {recap === "intake" && (
        <>
          <span className="font-mono text-sm uppercase tracking-widest text-ice">Trip intake</span>
          <h2 className="mt-2 font-display text-3xl uppercase tracking-tight text-paper">
            {trip.dest || "Awaiting destination"}
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <RecapFact label="Dates" value={trip.dateRange[0] ? `${trip.dateRange[0]} → ${trip.dateRange[1]}` : "—"} />
            <RecapFact
              label="Budget"
              value={trip.budgetPerPerson > 0 ? `$${trip.budgetPerPerson} / person` : "—"}
            />
            <div className="col-span-2 rounded-lg border border-hairline px-4 py-3">
              <p className="font-mono text-[11px] uppercase tracking-widest text-muted">Travelers</p>
              <p className="mt-1 font-mono text-sm text-paper">
                {trip.travelers.map((t) => t.name).join(" · ") || "—"}
              </p>
            </div>
          </div>
        </>
      )}

      {recap === "calls" && (
        <>
          <span className="font-mono text-sm uppercase tracking-widest text-ice">Call summary</span>
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
            {trip.travelers.filter((t) => t.transcript.length > 0).length === 0 ? (
              <p className="font-mono italic text-muted">No call activity yet.</p>
            ) : (
              trip.travelers
                .filter((t) => t.transcript.length > 0)
                .map((t) => (
                  <div key={t.id} className="rounded-lg border border-hairline px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="font-heading text-sm uppercase tracking-wide text-paper">{t.name}</span>
                      <span className="font-mono text-[11px] text-muted">
                        {[t.origin, t.seat, t.diet].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1">
                      {t.transcript.map((line, i) => (
                        <li key={i} className="font-mono text-xs leading-relaxed text-muted">
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
            )}
          </div>
        </>
      )}

      {recap === "verification" && (
        <>
          <span className="font-mono text-sm uppercase tracking-widest text-ice">Payment</span>
          <h2 className="mt-2 font-display text-3xl uppercase tracking-tight text-paper">Corporate account</h2>
          <div className="mt-6 flex-1 space-y-3 overflow-y-auto">
            {trip.travelers.map((t) => {
              const row = trip.split?.find((s) => s.travelerId === t.id);
              return (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-hairline px-4 py-3">
                  <span className="font-heading text-sm uppercase tracking-wide text-paper">{t.name}</span>
                  <span className="font-mono text-sm text-ice">
                    {row ? `$${row.amount.toFixed(2)}` : "—"}
                  </span>
                  <span
                    className="font-mono text-[11px] uppercase tracking-wide"
                    style={{ color: row?.paypalStatus === "paid" ? "var(--success)" : "var(--muted)" }}
                  >
                    {row?.paypalStatus ?? "pending"}
                  </span>
                </div>
              );
            })}
            <div className="flex items-center justify-between rounded-lg border border-amber/50 bg-amber/5 px-4 py-3">
              <span className="font-heading text-sm uppercase tracking-wide text-amber">Total</span>
              <span className="font-mono text-sm text-paper">${trip.totalCost.toFixed(2)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RecapFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-hairline px-4 py-3">
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted">{label}</p>
      <p className="mt-1 font-mono text-sm text-paper">{value}</p>
    </div>
  );
}

function BackToLive({ onExit }: { onExit?: () => void }) {
  if (!onExit) return null;
  return (
    <button
      onClick={onExit}
      className="absolute right-6 top-6 z-10 rounded border border-hairline px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-muted transition hover:border-amber hover:text-amber"
    >
      ← Back to live
    </button>
  );
}

function PlanView({ trip, title }: { trip: TripObject; title: string }) {
  return (
    <div className="animate-fade-in flex h-full flex-col rounded-2xl border border-hairline bg-panel p-8">
      <span className="font-mono text-sm uppercase tracking-widest text-ice">{title}</span>
      <h2 className="mt-2 font-display text-3xl uppercase tracking-tight text-paper">
        {trip.dest || "Awaiting destination"}
      </h2>
      <div className="mt-6 flex-1 space-y-3 overflow-y-auto">
        {trip.legs.length === 0 ? (
          <p className="font-mono italic text-muted">No legs yet — swarm is still gathering constraints.</p>
        ) : (
          trip.legs.map((leg, i) => {
            const isFailed = leg.status === "failed";
            const isBooked = leg.status === "booked";
            return (
              <div
                key={i}
                className={`animate-slide-in-up rounded-lg border px-4 py-3 font-mono text-sm ${
                  isFailed
                    ? "border-signal text-signal line-through decoration-2"
                    : isBooked
                      ? "border-success text-paper"
                      : "border-hairline text-muted"
                }`}
              >
                <span className="mr-2 text-[11px] uppercase tracking-wide text-muted no-underline">{leg.type}</span>
                {describeLeg(leg)}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
