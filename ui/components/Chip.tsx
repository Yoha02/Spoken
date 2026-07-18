type Tone = "ice" | "amber" | "success" | "signal" | "muted";

const TONE_VAR: Record<Tone, string> = {
  ice: "var(--ice)",
  amber: "var(--amber)",
  success: "var(--success)",
  signal: "var(--signal)",
  muted: "var(--muted)",
};

export function Chip({
  children,
  tone = "ice",
  animate = true,
}: {
  children: React.ReactNode;
  tone?: Tone;
  animate?: boolean;
}) {
  const color = TONE_VAR[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide ${
        animate ? "animate-pop-in" : ""
      }`}
      style={{ borderColor: color, color }}
    >
      {children}
    </span>
  );
}
