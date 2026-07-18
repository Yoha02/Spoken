import type { TripObject } from "@/core/tripObject";

const STATUS_TONE: Record<string, string> = {
  pending: "var(--muted)",
  requested: "var(--ice)",
  paid: "var(--success)",
};

export function PaymentGate({
  trip,
  onApprove,
  approving,
  confirming,
  error,
}: {
  trip: TripObject;
  onApprove: () => void;
  approving: boolean;
  confirming?: boolean;
  error: string | null;
}) {
  const hasSplit = !!trip.split && trip.split.length > 0;
  const billableTotal =
    trip.totalCost > 0
      ? trip.totalCost
      : trip.budgetPerPerson > 0
        ? trip.budgetPerPerson * trip.travelers.length
        : 0;
  const perPerson = trip.travelers.length > 0 ? billableTotal / trip.travelers.length : 0;

  if (confirming) {
    return (
      <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-6 backdrop-blur-sm">
        <div className="animate-pop-in flex w-full max-w-lg flex-col items-center rounded-2xl border-2 border-success bg-panel p-10 text-center">
          <span className="font-display text-3xl uppercase tracking-tight text-success">PayPal requests sent</span>
          <p className="mt-3 font-mono text-sm text-muted">Opening checkout — waiting on traveler approvals...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-6 backdrop-blur-sm">
      <div className="animate-pop-in w-full max-w-lg rounded-2xl border-2 border-amber bg-panel p-8">
        <span className="font-mono text-xs uppercase tracking-widest text-amber">Human in the loop</span>
        <h2 className="mt-2 font-display text-3xl uppercase tracking-tight text-paper">Approve payment split</h2>

        <div className="mt-6 space-y-3">
          {trip.travelers.map((t, i) => {
            const row = trip.split?.find((s) => s.travelerId === t.id);
            const amount = row?.amount ?? perPerson;
            const status = row?.paypalStatus ?? "pending";
            return (
              <div
                key={t.id}
                className="animate-slide-in-up rounded-lg border border-hairline px-4 py-3"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-heading text-sm uppercase tracking-wide text-paper">{t.name}</span>
                  <span className="font-mono text-sm text-ice">${amount.toFixed(2)}</span>
                  <span
                    key={status}
                    className="animate-pop-in rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wide"
                    style={{ borderColor: STATUS_TONE[status], color: STATUS_TONE[status] }}
                  >
                    {status}
                  </span>
                </div>
                {row?.approveUrl && status === "requested" && (
                  <a
                    href={row.approveUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block font-mono text-[11px] uppercase tracking-wide text-ice hover:text-paper"
                  >
                    Open PayPal checkout →
                  </a>
                )}
              </div>
            );
          })}
        </div>

        {!hasSplit && (
          <button
            onClick={onApprove}
            disabled={approving || billableTotal <= 0}
            className="mt-6 w-full rounded-lg bg-amber px-4 py-3 font-display uppercase tracking-wide text-bg transition hover:brightness-110 disabled:opacity-50"
          >
            {approving ? "Creating PayPal orders..." : "Approve & send requests"}
          </button>
        )}

        {!hasSplit && billableTotal <= 0 && (
          <p className="mt-3 font-mono text-[11px] text-signal">
            No final total yet — book the trip (or set budget) before sending PayPal requests.
          </p>
        )}

        {hasSplit && (
          <p className="mt-4 font-mono text-[11px] leading-relaxed text-muted">
            PayPal checkout links created per traveler. Open each link and complete payment with a
            sandbox personal buyer account — status flips to paid only after capture.
          </p>
        )}

        {error && <p className="mt-3 font-mono text-sm text-signal">{error}</p>}

        <p className="mt-5 text-center font-mono text-[11px] leading-relaxed text-muted">
          Autonomous on everything reversible. Human on everything you can&apos;t take back.
        </p>
      </div>
    </div>
  );
}
