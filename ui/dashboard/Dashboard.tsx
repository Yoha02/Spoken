"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTripStream } from "@/ui/hooks/useTripStream";
import { useDisplayPhase } from "@/ui/hooks/useDisplayPhase";
import { buildActionFeed } from "@/ui/lib/actionFeed";
import { TopBar } from "@/ui/components/TopBar";
import { SwarmStrip } from "@/ui/components/SwarmStrip";
import { CenterStage } from "@/ui/components/CenterStage";
import { ActionFeed } from "@/ui/components/ActionFeed";
import { PaymentGate } from "@/ui/components/PaymentGate";
import { TripConfirmation } from "@/ui/components/TripConfirmation";

function resolveBillableTotal(trip: {
  totalCost: number;
  budgetPerPerson: number;
  travelers: { length: number };
  legs: { type: string; price?: number }[];
}): number {
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
  if (fromCost > 0 && n > 1 && fromLegs > 0) {
    const per = fromLegs / n;
    if (Math.abs(fromCost - per) < 0.02) fromCost = fromLegs;
  }
  return Math.max(fromLegs, fromCost, fromBudget);
}

export default function Dashboard() {
  const { trip, connected } = useTripStream();

  const phase = useDisplayPhase(trip);
  const feed = trip ? buildActionFeed(trip) : [];

  const [approving, setApproving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [captureNote, setCaptureNote] = useState<string | null>(null);
  const [gateDismissed, setGateDismissed] = useState(false);
  /** Only after this session's successful PayPal return — never on bare /. */
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [capturingPayment, setCapturingPayment] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Re-arm the gate whenever we leave the payment phase (fresh run or paid).
  useEffect(() => {
    if (phase !== "awaiting_payment") setGateDismissed(false);
  }, [phase]);

  // Confirmation ONLY after PayPal redirect. Plain / always shows mission control.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const paypal = params.get("paypal");
    const token = params.get("token");
    const justConfirmed = params.get("confirmed") === "1";

    if (justConfirmed && sessionStorage.getItem("paypalJustPaid") === "1") {
      setShowConfirmation(true);
      return;
    }
    if (justConfirmed && sessionStorage.getItem("paypalJustPaid") !== "1") {
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (paypal === "cancel") {
      setCaptureNote("PayPal checkout cancelled — payment not captured.");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (paypal !== "return" || !token) return;

    let cancelled = false;
    setShowConfirmation(true);
    setCapturingPayment(true);
    setCaptureError(null);

    (async () => {
      try {
        const res = await fetch("/api/paypal/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: token }),
        });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) throw new Error(body.error ?? `Capture failed (${res.status})`);
        sessionStorage.setItem("paypalJustPaid", "1");
        setCaptureNote(
          body.allPaid
            ? "Corporate payment captured — trip confirmed."
            : "PayPal payment captured."
        );
        window.history.replaceState({}, "", "/?confirmed=1");
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "PayPal capture failed";
          setCaptureError(msg);
          setCaptureNote(msg);
          window.history.replaceState({}, "", window.location.pathname);
        }
      } finally {
        if (!cancelled) setCapturingPayment(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleApprove() {
    if (!trip) return;
    setApproving(true);
    setApproveError(null);
    setCaptureNote(null);

    try {
      const totalCost = resolveBillableTotal(trip);
      const res = await fetch("/api/paypal/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(totalCost > 0 ? { totalCost } : {}),
          returnBase: window.location.origin,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) {
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      if (!res.ok && res.status === 409 && !Array.isArray(body.split)) {
        throw new Error(body.error ?? "Payment already authorized");
      }

      setApproving(false);
      setConfirming(true);
      await new Promise((r) => setTimeout(r, 1200));
      setConfirming(false);

      const rows: { approveUrl?: string; paypalStatus?: string }[] = Array.isArray(body.split)
        ? body.split
        : [];
      const checkoutUrl =
        typeof body.approveUrl === "string" && body.approveUrl
          ? body.approveUrl
          : rows.find((r) => r.approveUrl && r.paypalStatus !== "paid")?.approveUrl;
      if (typeof checkoutUrl === "string" && checkoutUrl) {
        window.open(checkoutUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "Failed to authorize payment");
      setApproving(false);
    }
  }

  if (!trip) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg">
        <p className="font-mono text-muted">Connecting...</p>
      </main>
    );
  }

  if (showConfirmation) {
    return (
      <main className="bg-scanlines min-h-screen bg-bg px-6 py-8 text-paper sm:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted">Swarm Mode</p>
            <p className="font-display text-lg uppercase tracking-tight text-paper">
              {trip.dest || "Trip"} confirmed
            </p>
          </div>
          <span className="rounded-full border border-success px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-success">
            {capturingPayment ? "Capturing…" : phase === "paid" ? "Paid" : "Confirming"}
          </span>
        </div>

        <TripConfirmation
          trip={trip}
          capturing={capturingPayment}
          error={captureError}
          onBack={() => {
            setShowConfirmation(false);
            setCaptureError(null);
            try {
              sessionStorage.removeItem("paypalJustPaid");
            } catch {
              /* ignore */
            }
            window.history.replaceState({}, "", window.location.pathname);
          }}
        />

        {captureNote && !capturingPayment && !captureError && (
          <p className="mx-auto mt-8 max-w-lg text-center font-mono text-xs text-success">
            {captureNote}
          </p>
        )}
      </main>
    );
  }

  const gateOpen = phase === "awaiting_payment" && !gateDismissed;
  const dimmed = gateOpen;

  return (
    <main className="bg-scanlines min-h-screen bg-bg px-8 py-6 text-paper">
      <div className={`transition-all duration-300 ${dimmed ? "pointer-events-none scale-[0.99] opacity-30 blur-[1px]" : ""}`}>
        <TopBar trip={trip} phase={phase} />

        <MissionControlStrip connected={connected} />

        {phase === "paid" && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/40 bg-panel/50 px-4 py-3">
            <p className="font-mono text-xs text-success">
              Trip is paid. Open traveler confirmations when you want them.
            </p>
            <button
              type="button"
              onClick={() => {
                try {
                  sessionStorage.setItem("paypalJustPaid", "1");
                } catch {
                  /* ignore */
                }
                setShowConfirmation(true);
                window.history.replaceState({}, "", "/?confirmed=1");
              }}
              className="rounded border border-success px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-success hover:bg-success/10"
            >
              View confirmations
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-6">
          <SwarmStrip travelers={trip.travelers} />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
            <div className="h-[440px]">
              <CenterStage trip={trip} phase={phase} />
            </div>
            <div className="h-[440px] rounded-2xl border border-hairline bg-panel/40 p-4">
              <ActionFeed items={feed} />
            </div>
          </div>
        </div>
      </div>

      {gateOpen && (
        <PaymentGate
          trip={trip}
          onApprove={handleApprove}
          onDismiss={() => setGateDismissed(true)}
          approving={approving}
          confirming={confirming}
          error={approveError}
        />
      )}

      {phase === "awaiting_payment" && gateDismissed && (
        <button
          onClick={() => setGateDismissed(false)}
          className="fixed bottom-6 right-6 z-40 rounded-full border border-amber bg-panel px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-amber shadow-lg transition hover:bg-amber/10"
        >
          Complete verification →
        </button>
      )}

      {captureNote && !dimmed && (
        <p className="fixed bottom-16 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-success/40 bg-panel px-4 py-2 font-mono text-xs text-success">
          {captureNote}
        </p>
      )}
    </main>
  );
}

function MissionControlStrip({ connected }: { connected: boolean }) {
  const [pastedText, setPastedText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(
    action: () => Promise<Response>,
    successNote: (body: Record<string, unknown>) => string
  ) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await action();
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setNote(successNote(body));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  function swarmLabel(b: Record<string, unknown>): string {
    const n = typeof b.travelerCount === "number" ? b.travelerCount : 0;
    return `Swarm started — calling ${n} traveler(s)`;
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-panel/40 px-4 py-3">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: connected ? "var(--success)" : "var(--muted)" }}
      />
      <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
        {connected ? "Stream live" : "Connecting"}
      </span>

      <div className="mx-2 h-4 w-px bg-hairline" />

      <button
        onClick={() =>
          run(
            () => fetch("/api/import-email", { method: "POST" }),
            (b) => {
              const subject =
                (b.email as { subject?: string } | undefined)?.subject ?? "email";
              const n = Array.isArray(b.travelers) ? b.travelers.length : 0;
              const swarm = b.swarm as { ok?: boolean } | undefined;
              if (n === 0) return `Imported "${subject}"`;
              if (!swarm?.ok) return `Imported "${subject}" · extracted ${n}; swarm failed`;
              return `Imported "${subject}" · Vocal Bridge calling ${n}`;
            }
          )
        }
        disabled={busy}
        className="rounded border border-ice px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-ice hover:bg-ice/10 disabled:opacity-50"
      >
        Import latest email
      </button>

      <input
        value={pastedText}
        onChange={(e) => setPastedText(e.target.value)}
        placeholder="...or paste trip text"
        className="min-w-[220px] flex-1 rounded border border-hairline bg-bg px-3 py-1.5 font-mono text-[11px] text-paper placeholder:text-muted focus:border-ice focus:outline-none"
      />
      <button
        onClick={() =>
          run(
            () =>
              fetch("/api/extract", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: pastedText }),
              }),
            (b) => {
              const n = Array.isArray(b.travelers) ? b.travelers.length : 0;
              if (!n) return `Extracted via ${b.source as string}`;
              return `Extracted via ${b.source as string} · ${n} travelers → Vocal Bridge`;
            }
          )
        }
        disabled={busy || !pastedText.trim()}
        className="rounded border border-hairline px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-muted hover:text-paper disabled:opacity-50"
      >
        Extract
      </button>

      <div className="mx-2 h-4 w-px bg-hairline" />

      <button
        onClick={() => run(() => fetch("/api/agent", { method: "POST" }), swarmLabel)}
        disabled={busy}
        className="rounded bg-amber px-3 py-1.5 font-display text-[11px] uppercase tracking-wide text-bg hover:brightness-110 disabled:opacity-50"
      >
        Start swarm
      </button>

      <Link href="/canvas" className="ml-auto font-mono text-[11px] uppercase tracking-widest text-ice hover:text-paper">
        Open canvas →
      </Link>

      {note && <p className="w-full font-mono text-[11px] text-success">{note}</p>}
      {error && <p className="w-full font-mono text-[11px] text-signal">{error}</p>}
    </div>
  );
}
