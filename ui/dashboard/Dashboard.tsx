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

function resolveBillableTotal(trip: {
  totalCost: number;
  budgetPerPerson: number;
  travelers: { length: number };
}): number {
  if (trip.totalCost > 0) return trip.totalCost;
  if (trip.budgetPerPerson > 0 && trip.travelers.length > 0) {
    return trip.budgetPerPerson * trip.travelers.length;
  }
  return 0;
}

export default function Dashboard() {
  const { trip, connected } = useTripStream();

  const phase = useDisplayPhase(trip);
  const feed = trip ? buildActionFeed(trip) : [];

  const [approving, setApproving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [captureNote, setCaptureNote] = useState<string | null>(null);

  // After a traveler finishes PayPal checkout they land on /?paypal=return&token=ORDER_ID.
  // Capture the order and mark that share paid (only real captures flip status to paid).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const paypal = params.get("paypal");
    const token = params.get("token");
    if (paypal !== "return" || !token) {
      if (paypal === "cancel") {
        setCaptureNote("PayPal checkout cancelled — payment still requested.");
        window.history.replaceState({}, "", window.location.pathname);
      }
      return;
    }

    let cancelled = false;
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
        setCaptureNote(
          body.allPaid
            ? "All payments captured — trip confirmed."
            : "PayPal payment captured for one traveler."
        );
      } catch (err) {
        if (!cancelled) {
          setCaptureNote(err instanceof Error ? err.message : "PayPal capture failed");
        }
      } finally {
        if (!cancelled) {
          window.history.replaceState({}, "", window.location.pathname);
        }
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
      // Always create real PayPal Checkout orders — never jump straight to "paid".
      const totalCost = resolveBillableTotal(trip);
      const res = await fetch("/api/paypal/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(totalCost > 0 ? { totalCost } : {}),
      });
      const body = await res.json().catch(() => ({}));
      // 409 = split already created — drop into live so real approve links show.
      if (!res.ok && res.status !== 409) {
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      if (!res.ok && res.status === 409 && !Array.isArray(body.split)) {
        throw new Error(body.error ?? "Split already requested");
      }

      setApproving(false);
      setConfirming(true);
      await new Promise((r) => setTimeout(r, 1200));
      setConfirming(false);

      // Open the first unpaid traveler's PayPal approve link (real sandbox checkout).
      const rows = Array.isArray(body.split)
        ? body.split
        : Array.isArray(body.orders)
          ? body.orders
          : [];
      const firstUrl = rows.find(
        (r: { approveUrl?: string; paypalStatus?: string }) =>
          r.approveUrl && r.paypalStatus !== "paid"
      )?.approveUrl;
      if (typeof firstUrl === "string" && firstUrl) {
        window.open(firstUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "Failed to request payment");
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

  const dimmed = phase === "awaiting_payment";

  return (
    <main className="bg-scanlines min-h-screen bg-bg px-8 py-6 text-paper">
      <div className={`transition-all duration-300 ${dimmed ? "pointer-events-none scale-[0.99] opacity-30 blur-[1px]" : ""}`}>
        <TopBar trip={trip} phase={phase} />

        <MissionControlStrip connected={connected} />

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

      {dimmed && (
        <PaymentGate
          trip={trip}
          onApprove={handleApprove}
          approving={approving}
          confirming={confirming}
          error={approveError}
        />
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
