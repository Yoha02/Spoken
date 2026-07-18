import type { Traveler } from "@/core/tripObject";

const STATUS_STYLES: Record<Traveler["callStatus"], { color: string; pulse: boolean; label: string }> = {
  idle: { color: "var(--muted)", pulse: false, label: "Idle" },
  ringing: { color: "var(--amber)", pulse: true, label: "Ringing" },
  live: { color: "var(--signal)", pulse: true, label: "Live" },
  done: { color: "var(--success)", pulse: false, label: "Done" },
  failed: { color: "var(--signal)", pulse: false, label: "Failed" },
};

export function callStatusStyle(status: Traveler["callStatus"]) {
  return STATUS_STYLES[status];
}

export function StatusDot({
  status,
  size = "md",
}: {
  status: Traveler["callStatus"];
  size?: "sm" | "md" | "lg";
}) {
  const style = STATUS_STYLES[status];
  const dim = size === "lg" ? "h-4 w-4" : size === "sm" ? "h-2 w-2" : "h-3 w-3";
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${dim} ${style.pulse ? "animate-pulse-dot" : ""}`}
      style={{ backgroundColor: style.color }}
      aria-label={style.label}
    />
  );
}
