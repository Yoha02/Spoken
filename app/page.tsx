"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTripStream } from "@/lib/useTripStream";
import { useDisplayPhase } from "@/lib/useDisplayPhase";
import { buildActionFeed } from "@/lib/actionFeed";
import { buildPreviewTrip, type PreviewKey } from "@/lib/previewTrip";
import { TopBar } from "@/components/TopBar";
import { SwarmStrip } from "@/components/SwarmStrip";
import { CenterStage } from "@/components/CenterStage";
import { ActionFeed } from "@/components/ActionFeed";
import { PaymentGate } from "@/components/PaymentGate";
import { PreviewControls } from "@/components/PreviewControls";

export default function DashboardPage() {
  const { trip, connected } = useTripStream();
  const [previewKey, setPreviewKey] = useState<PreviewKey | "live">("live");

  const effectiveTrip = useMemo(() => {
    if (!trip) return null;
    return previewKey === "live" ? trip : buildPreviewTrip(previewKey, trip);
  }, [trip, previewKey]);

  const phase = useDisplayPhase(effectiveTrip);
  const feed = effectiveTrip ? buildActionFeed(effectiveTrip) : [];

  const [approving, setApproving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  async function handleApprove() {
    setApproving(true);
    setApproveError(null);

    if (previewKey !== "live") {
      await new Promise((r) => setTimeout(r, 900));
      setApproving(false);
      setConfirming(true);
      await new Promise((r) => setTimeout(r, 1400));
      setConfirming(false);
      setPreviewKey("paid");
      return;
    }

    try {
      const res = await fetch("/api/paypal/split", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
    } catch (err) {
      setApproveError(err instanceof Error ? err.message : "Failed to request payment");
    } finally {
      setApproving(false);
    }
  }

  if (!effectiveTrip) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg">
        <p className="font-mono text-muted">Connecting…</p>
      </main>
    );
  }

  const dimmed = phase === "awaiting_payment";

  return (
    <main className="bg-scanlines min-h-screen bg-bg px-8 py-6 text-paper">
      <div className={`transition-all duration-300 ${dimmed ? "pointer-events-none scale-[0.99] opacity-30 blur-[1px]" : ""}`}>
        <TopBar trip={effectiveTrip} phase={phase} />

        <MissionControlStrip
          connected={connected}
          previewActive={previewKey !== "live"}
        />

        <div className="mt-6 flex flex-col gap-6">
          <SwarmStrip travelers={effectiveTrip.travelers} />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
            <div className="h-[440px]">
              <CenterStage trip={effectiveTrip} phase={phase} />
            </div>
            <div className="h-[440px] rounded-2xl border border-hairline bg-panel/40 p-4">
              <ActionFeed items={feed} />
            </div>
          </div>
        </div>
      </div>

      {dimmed && (
        <PaymentGate
          trip={effectiveTrip}
          onApprove={handleApprove}
          approving={approving}
          confirming={confirming}
          error={approveError}
        />
      )}

      <PreviewControls value={previewKey} onChange={setPreviewKey} />
    </main>
  );
}

function MissionControlStrip({ connected, previewActive }: { connected: boolean; previewActive: boolean }) {
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

  if (previewActive) {
    return (
      <div className="mt-5 flex items-center justify-between rounded-lg border border-dashed border-amber/50 bg-panel/40 px-4 py-3">
        <p className="font-mono text-xs uppercase tracking-widest text-amber">
          Previewing simulated data — switch to “Live” below to use real controls
        </p>
        <Link href="/canvas" className="font-mono text-xs uppercase tracking-widest text-ice hover:text-paper">
          Open canvas →
        </Link>
      </div>
    );
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
            (b) => `Imported "${(b.email as { subject?: string } | undefined)?.subject ?? "email"}"`
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
        placeholder="…or paste trip text"
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
            (b) => `Extracted via ${b.source as string}`
          )
        }
        disabled={busy || !pastedText.trim()}
        className="rounded border border-hairline px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-muted hover:text-paper disabled:opacity-50"
      >
        Extract
      </button>

      <div className="mx-2 h-4 w-px bg-hairline" />

      <button
        onClick={() => run(() => fetch("/api/agent", { method: "POST" }), () => "Swarm started")}
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
