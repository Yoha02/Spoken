export function MonoTimestamp({ ts, className = "" }: { ts: number; className?: string }) {
  const str = new Date(ts).toLocaleTimeString("en-US", { hour12: false });
  return <span className={`font-mono text-[11px] text-muted ${className}`}>{str}</span>;
}
