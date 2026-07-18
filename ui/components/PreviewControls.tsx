import { PREVIEW_KEYS, type PreviewKey } from "@/ui/lib/previewTrip";

const LABELS: Record<PreviewKey, string> = {
  planning: "Planning",
  booked: "Booked",
  disrupted: "Disrupted",
  rebooked: "Rebooked",
  awaiting_payment: "Awaiting pay",
  paid: "Paid",
};

export function PreviewControls({
  value,
  onChange,
}: {
  value: PreviewKey | "live";
  onChange: (value: PreviewKey | "live") => void;
}) {
  return (
    <div className="fixed bottom-4 left-4 z-40 flex flex-wrap items-center gap-1 rounded-lg border border-dashed border-muted/40 bg-bg/90 p-2 backdrop-blur">
      <span className="mr-1 font-mono text-[10px] uppercase tracking-widest text-muted">Preview (local only)</span>
      <button
        onClick={() => onChange("live")}
        className={`rounded px-2 py-1 font-mono text-[11px] uppercase transition-colors ${
          value === "live" ? "bg-amber text-bg" : "text-muted hover:text-paper"
        }`}
      >
        Live
      </button>
      {PREVIEW_KEYS.map((key) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`rounded px-2 py-1 font-mono text-[11px] uppercase transition-colors ${
            value === key ? "bg-amber text-bg" : "text-muted hover:text-paper"
          }`}
        >
          {LABELS[key]}
        </button>
      ))}
    </div>
  );
}
