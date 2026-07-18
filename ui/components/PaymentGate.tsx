import type { TripObject } from "@/core/tripObject";

export function PaymentGate({
  trip,
  onApprove,
  onDismiss,
  approving,
  confirming,
  error,
}: {
  trip: TripObject;
  onApprove: () => void;
  onDismiss: () => void;
  approving: boolean;
  confirming?: boolean;
  error: string | null;
}) {
  const hasSplit = !!trip.split && trip.split.length > 0;
  const n = trip.travelers.length;
  const fromLegs = trip.legs.reduce((sum, leg) => {
    if (leg.type === "flight" || leg.type === "hotel") {
      return sum + (typeof leg.price === "number" ? leg.price : 0);
    }
    return sum;
  }, 0);
  const fromBudget = trip.budgetPerPerson > 0 && n > 0 ? trip.budgetPerPerson * n : 0;
  let fromCost = trip.totalCost > 0 ? trip.totalCost : 0;
  if (fromCost > 0 && n > 1 && trip.budgetPerPerson > 0) {
    if (Math.abs(fromCost - trip.budgetPerPerson) < 0.02) {
      fromCost = trip.budgetPerPerson * n;
    }
  }
  const splitSum = hasSplit && trip.split ? trip.split.reduce((s, r) => s + r.amount, 0) : 0;
  const billableTotal = Math.max(fromLegs, fromCost, fromBudget, splitSum);
  const perPerson = n > 0 ? billableTotal / n : 0;
  const approveUrl = trip.split?.find((s) => s.approveUrl)?.approveUrl;

  if (confirming) {
    return (
      <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-6 backdrop-blur-sm">
        <div className="animate-pop-in flex w-full max-w-lg flex-col items-center rounded-2xl border-2 border-success bg-panel p-10 text-center">
          <span className="font-display text-3xl uppercase tracking-tight text-success">Payment authorized</span>
          <p className="mt-3 font-mono text-sm text-muted">Opening PayPal checkout...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-bg/85 p-6 backdrop-blur-sm">
      <div className="animate-pop-in relative w-full max-w-lg rounded-2xl border-2 border-amber bg-panel p-8">
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="absolute right-4 top-4 rounded px-2 py-0.5 font-mono text-lg leading-none text-muted transition hover:text-paper"
        >
          ×
        </button>

        <span className="font-mono text-xs uppercase tracking-widest text-amber">Corporate travel account</span>
        <h2 className="mt-2 font-display text-3xl uppercase tracking-tight text-paper">Verify trip expenses</h2>
        <p className="mt-2 font-mono text-[12px] leading-relaxed text-muted">
          Please complete verification — review the expense breakdown, then authorize
          payment from the corporate account.
        </p>

        <div className="mt-5 space-y-3">
          {trip.travelers.map((t, i) => {
            const row = trip.split?.find((s) => s.travelerId === t.id);
            const amount = row?.amount ?? perPerson;
            return (
              <div
                key={t.id}
                className="animate-slide-in-up flex items-center justify-between gap-3 rounded-lg border border-hairline px-4 py-3"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span className="font-heading text-sm uppercase tracking-wide text-paper">{t.name}</span>
                <span className="font-mono text-sm text-ice">${amount.toFixed(2)}</span>
              </div>
            );
          })}

          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber/50 bg-amber/5 px-4 py-3">
            <span className="font-heading text-sm uppercase tracking-wide text-amber">Total</span>
            <span className="font-mono text-sm text-paper">${billableTotal.toFixed(2)}</span>
          </div>
        </div>

        {!hasSplit && (
          <button
            onClick={onApprove}
            disabled={approving || billableTotal <= 0}
            className="mt-6 w-full rounded-lg bg-amber px-4 py-3 font-display uppercase tracking-wide text-bg transition hover:brightness-110 disabled:opacity-50"
          >
            {approving ? "Authorizing..." : "Authorize payment"}
          </button>
        )}

        {!hasSplit && billableTotal <= 0 && (
          <p className="mt-3 font-mono text-[11px] text-signal">
            No final total yet — booking still in progress.
          </p>
        )}

        {hasSplit && (
          <div className="mt-5 space-y-2">
            <p className="font-mono text-[11px] leading-relaxed text-muted">
              Payment authorized — complete the PayPal checkout to settle the corporate account.
            </p>
            {approveUrl && (
              <a
                href={approveUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block font-mono text-[11px] uppercase tracking-wide text-ice hover:text-paper"
              >
                Open PayPal checkout →
              </a>
            )}
          </div>
        )}

        {error && <p className="mt-3 font-mono text-sm text-signal">{error}</p>}
      </div>
    </div>
  );
}
