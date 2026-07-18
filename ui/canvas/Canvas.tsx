"use client";

import { useTripStream } from "@/ui/hooks/useTripStream";
import { useDisplayPhase } from "@/ui/hooks/useDisplayPhase";
import { buildActionFeed } from "@/ui/lib/actionFeed";
import type { Leg, Traveler } from "@/core/tripObject";
import { StatusDot, callStatusStyle } from "@/ui/components/StatusDot";
import { Chip } from "@/ui/components/Chip";
import { PhaseBadge } from "@/ui/components/PhaseBadge";
import { AnimatedNumber } from "@/ui/components/AnimatedNumber";
import { MonoTimestamp } from "@/ui/components/MonoTimestamp";

export default function Canvas() {
  const { trip, connected } = useTripStream();
  const phase = useDisplayPhase(trip);

  if (!trip) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg">
        <p className="font-mono text-2xl text-muted">Connecting to swarm...</p>
      </main>
    );
  }

  const budgetTotal = trip.budgetPerPerson * trip.travelers.length;
  const feed = buildActionFeed(trip);

  return (
    <main className="bg-scanlines flex min-h-screen flex-col gap-8 bg-bg px-10 py-8 text-paper">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-6">
        <div>
          <h1 className="font-display text-5xl uppercase tracking-tight">
            Swarm Mode
            {trip.dest && <span className="text-amber"> · {trip.dest}</span>}
          </h1>
          <p className="mt-2 font-mono text-xl text-muted">
            {trip.dateRange[0]
              ? `${trip.dateRange[0]} — ${trip.dateRange[1]} · $${trip.budgetPerPerson}/person`
              : "Waiting for trip details…"}
          </p>
        </div>
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2 font-mono text-lg text-muted">
            <span
              className={`h-3 w-3 rounded-full ${connected ? "animate-pulse-dot" : ""}`}
              style={{ backgroundColor: connected ? "var(--success)" : "var(--muted)" }}
            />
            {connected ? "Live" : "Reconnecting"}
          </span>
          <span className="font-mono text-lg text-muted">
            Total <AnimatedNumber value={trip.totalCost} prefix="$" duration={600} />
            {budgetTotal > 0 && <span> / ${budgetTotal}</span>}
          </span>
          <PhaseBadge phase={phase} />
        </div>
      </header>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {trip.travelers.map((traveler) => (
          <TravelerCard key={traveler.id} traveler={traveler} />
        ))}
      </section>

      <section className="grid min-h-0 flex-1 grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex min-h-0 flex-col rounded-2xl border border-hairline bg-panel/60 p-6 xl:col-span-2">
          <h2 className="mb-4 font-display text-2xl uppercase tracking-tight">Transcript lanes</h2>
          <div className="flex-1 space-y-4 overflow-auto">
            {trip.travelers.map((traveler) => (
              <TranscriptLane key={traveler.id} traveler={traveler} />
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-col rounded-2xl border border-hairline bg-panel/60 p-6">
          <h2 className="mb-4 font-display text-2xl uppercase tracking-tight">Itinerary</h2>
          <div className="flex-1 overflow-auto">
            <ItineraryPanel legs={trip.legs} />
          </div>
        </div>
      </section>

      <section className="max-h-64 overflow-auto rounded-2xl border border-hairline bg-panel/60 p-6">
        <h2 className="mb-4 font-display text-2xl uppercase tracking-tight">Action feed</h2>
        {feed.length === 0 ? (
          <p className="font-mono italic text-muted">No tool calls yet</p>
        ) : (
          <ul className="space-y-1.5">
            {feed.map((item) => (
              <li key={item.id} className="animate-slide-in-top flex items-center gap-3 font-mono text-sm">
                <MonoTimestamp ts={item.ts} />
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.ok ? "var(--success)" : "var(--signal)" }}
                />
                <span className="text-paper">{item.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function TravelerCard({ traveler }: { traveler: Traveler }) {
  const style = callStatusStyle(traveler.callStatus);
  const hasConstraints = traveler.origin || traveler.seat || (traveler.diet && traveler.diet !== "none");
  const active = traveler.callStatus === "live" || traveler.callStatus === "ringing";

  return (
    <div
      className={`animate-slide-in-up rounded-2xl border bg-panel p-6 transition-colors duration-300 ${active ? "border-2" : "border"}`}
      style={{ borderColor: active ? style.color : "var(--hairline)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-heading text-3xl font-bold uppercase tracking-wide">{traveler.name}</h3>
        <StatusDot status={traveler.callStatus} size="lg" />
      </div>
      <p className="mb-4 font-mono text-lg uppercase tracking-wide" style={{ color: style.color }}>
        {style.label}
      </p>
      <div className="flex flex-wrap gap-2">
        {!hasConstraints && <span className="font-mono text-sm text-muted">No constraints yet</span>}
        {traveler.origin && <Chip tone="ice">{traveler.origin}</Chip>}
        {traveler.seat && <Chip tone="muted">{traveler.seat}</Chip>}
        {traveler.diet && traveler.diet !== "none" && <Chip tone="amber">{traveler.diet}</Chip>}
      </div>
    </div>
  );
}

function TranscriptLane({ traveler }: { traveler: Traveler }) {
  const lines = traveler.transcript.slice(-4);
  return (
    <div className="rounded-xl bg-bg/60 p-4">
      <p className="mb-2 font-heading text-lg font-bold text-muted">{traveler.name}</p>
      {lines.length === 0 ? (
        <p className="font-mono italic text-muted">No transcript yet</p>
      ) : (
        <ul className="space-y-1">
          {lines.map((line, i) => (
            <li key={i} className="animate-slide-in-up font-mono text-lg leading-snug text-paper">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItineraryPanel({ legs }: { legs: Leg[] }) {
  if (legs.length === 0) {
    return <p className="font-mono italic text-muted">No legs proposed yet</p>;
  }

  return (
    <ul className="space-y-3">
      {legs.map((leg, i) => {
        const isFailed = leg.status === "failed";
        const isBooked = leg.status === "booked";
        return (
          <li
            key={i}
            className={`animate-slide-in-up rounded-xl border bg-bg/60 p-4 ${
              isFailed ? "border-signal" : isBooked ? "border-success" : "border-hairline"
            }`}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-sm uppercase tracking-wide text-muted">{leg.type}</span>
              <StatusChip status={leg.status} />
            </div>
            <p className={`font-mono text-lg ${isFailed ? "text-signal line-through" : "text-paper"}`}>
              {describeLeg(leg)}
            </p>
          </li>
        );
      })}
    </ul>
  );
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

const LEG_STATUS_TONE: Record<string, string> = {
  proposed: "var(--amber)",
  booked: "var(--success)",
  calling: "var(--ice)",
  failed: "var(--signal)",
};

function StatusChip({ status }: { status: string }) {
  const color = LEG_STATUS_TONE[status] ?? "var(--muted)";
  return (
    <span
      className="rounded-full border px-3 py-1 font-mono text-sm uppercase tracking-wide"
      style={{ borderColor: color, color }}
    >
      {status}
    </span>
  );
}
