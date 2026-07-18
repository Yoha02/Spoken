import type { Leg, Traveler, TripObject } from "@/core/tripObject";

function formatWhen(iso: string): string {
  if (!iso) return "—";
  // Keep demo-friendly: show date + time if present without heavy locale deps.
  const [date, time] = iso.split("T");
  if (!time) return date;
  return `${date} · ${time.slice(0, 5)}`;
}

function flightFor(trip: TripObject, travelerId: string): Extract<Leg, { type: "flight" }> | undefined {
  return trip.legs.find(
    (l): l is Extract<Leg, { type: "flight" }> => l.type === "flight" && l.travelerId === travelerId
  );
}

function hotelLeg(trip: TripObject): Extract<Leg, { type: "hotel" }> | undefined {
  return trip.legs.find((l): l is Extract<Leg, { type: "hotel" }> => l.type === "hotel");
}

function dinnerLeg(trip: TripObject): Extract<Leg, { type: "dinner" }> | undefined {
  return trip.legs.find((l): l is Extract<Leg, { type: "dinner" }> => l.type === "dinner");
}

function shareFor(trip: TripObject, travelerId: string): number {
  const row = trip.split?.find((s) => s.travelerId === travelerId);
  if (row) return row.amount;
  if (trip.travelers.length === 0) return 0;
  return trip.totalCost > 0 ? trip.totalCost / trip.travelers.length : 0;
}

function ConfirmationCard({
  trip,
  traveler,
  index,
}: {
  trip: TripObject;
  traveler: Traveler;
  index: number;
}) {
  const flight = flightFor(trip, traveler.id);
  const hotel = hotelLeg(trip);
  const dinner = dinnerLeg(trip);
  const share = shareFor(trip, traveler.id);
  const paid = trip.split?.find((s) => s.travelerId === traveler.id)?.paypalStatus === "paid";
  const dest = trip.dest || flight?.dest || "Destination";

  return (
    <article
      className="animate-slide-in-up flex flex-col rounded-2xl border-2 border-success/50 bg-panel p-6"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-success">Confirmed</p>
          <h3 className="mt-1 font-display text-2xl uppercase tracking-tight text-paper">
            {traveler.name}
          </h3>
          <p className="mt-0.5 font-mono text-xs text-muted">{traveler.phone}</p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wide ${
            paid ? "border-success text-success" : "border-amber text-amber"
          }`}
        >
          {paid ? "Paid" : "Pending"}
        </span>
      </div>

      <div className="mt-5 space-y-3 font-mono text-sm">
        <div className="rounded-lg border border-hairline px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-widest text-muted">Flight</p>
          {flight ? (
            <>
              <p className="mt-1 text-paper">
                {flight.origin} → {flight.dest}
                <span className="text-muted"> · {flight.carrier}</span>
              </p>
              <p className="text-muted">
                {formatWhen(flight.depart)} → {formatWhen(flight.arrive)}
              </p>
              {flight.pnr && <p className="mt-1 text-ice">PNR {flight.pnr}</p>}
            </>
          ) : (
            <p className="mt-1 text-muted">Itinerary pending</p>
          )}
        </div>

        <div className="rounded-lg border border-hairline px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-widest text-muted">Hotel</p>
          {hotel ? (
            <>
              <p className="mt-1 text-paper">{hotel.name}</p>
              <p className="text-muted">
                {hotel.checkIn} → {hotel.checkOut} · {hotel.rooms} room(s)
              </p>
            </>
          ) : (
            <p className="mt-1 text-muted">Shared lodging TBD</p>
          )}
        </div>

        <div className="rounded-lg border border-hairline px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-widest text-muted">Dinner</p>
          {dinner ? (
            <>
              <p className="mt-1 text-paper">{dinner.place}</p>
              <p className="text-muted">
                {formatWhen(dinner.time)} · party of {dinner.partySize}
              </p>
            </>
          ) : (
            <p className="mt-1 text-muted">Group dinner TBD</p>
          )}
        </div>

        <div className="rounded-lg border border-hairline px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-widest text-muted">Preferences</p>
          <p className="mt-1 text-paper">
            {[
              traveler.origin ? `Origin ${traveler.origin}` : null,
              traveler.seat ? `Seat ${traveler.seat}` : null,
              traveler.diet ? `Diet ${traveler.diet}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No prefs captured"}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between border-t border-hairline pt-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Your share</p>
          <p className="font-display text-2xl tabular-nums text-ice">${share.toFixed(2)}</p>
        </div>
        <p className="text-right font-mono text-[11px] text-muted">
          Trip to <span className="text-paper">{dest}</span>
          {trip.dateRange[0] && (
            <>
              <br />
              {trip.dateRange[0]}
              {trip.dateRange[1] ? ` → ${trip.dateRange[1]}` : ""}
            </>
          )}
        </p>
      </div>
    </article>
  );
}

export function TripConfirmation({
  trip,
  onBack,
  capturing,
  error,
}: {
  trip: TripObject;
  onBack?: () => void;
  capturing?: boolean;
  error?: string | null;
}) {
  const total =
    trip.totalCost > 0
      ? trip.totalCost
      : trip.split?.reduce((s, r) => s + r.amount, 0) ?? 0;
  const allPaid = !!trip.split?.length && trip.split.every((s) => s.paypalStatus === "paid");

  if (capturing) {
    return (
      <div className="animate-fade-in flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-ice">PayPal</p>
        <h2 className="mt-3 font-display text-4xl uppercase tracking-tight text-paper">
          Confirming payment…
        </h2>
        <p className="mt-3 font-mono text-sm text-muted">Capturing order and building your tickets.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-fade-in flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-signal">Payment issue</p>
        <h2 className="mt-3 font-display text-3xl uppercase tracking-tight text-paper">
          Could not confirm
        </h2>
        <p className="mt-3 max-w-md font-mono text-sm text-signal">{error}</p>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mt-8 rounded-lg border border-hairline px-4 py-2 font-mono text-xs uppercase tracking-wide text-muted hover:text-paper"
          >
            Back to dashboard
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="animate-fade-in mx-auto max-w-6xl">
      <header className="mb-8 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-success">
          {allPaid ? "Payment complete" : "Trip booked"}
        </p>
        <h2 className="mt-2 font-display text-4xl uppercase tracking-tight text-paper sm:text-5xl">
          Trip confirmation
        </h2>
        <p className="mt-3 font-mono text-sm text-muted">
          {trip.dest || "Destination"}
          {trip.dateRange[0] ? ` · ${trip.dateRange[0]}` : ""}
          {trip.dateRange[1] ? ` → ${trip.dateRange[1]}` : ""}
          {total > 0 ? ` · $${total.toFixed(2)} total` : ""}
        </p>
        <p className="mt-2 font-mono text-xs text-muted">
          One confirmation card per traveler — share this screen with the group.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {trip.travelers.map((t, i) => (
          <ConfirmationCard key={t.id} trip={trip} traveler={t} index={i} />
        ))}
      </div>

      {onBack && (
        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-hairline px-4 py-2 font-mono text-xs uppercase tracking-wide text-muted transition hover:border-ice hover:text-paper"
          >
            Back to mission control
          </button>
        </div>
      )}
    </div>
  );
}
