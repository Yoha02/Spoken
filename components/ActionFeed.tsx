import type { FeedItem } from "@/lib/actionFeed";
import { MonoTimestamp } from "./MonoTimestamp";

export function ActionFeed({ items }: { items: FeedItem[] }) {
  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-3 font-display text-xs uppercase tracking-[0.2em] text-muted">Action feed</h2>
      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {items.length === 0 && (
          <p className="font-mono text-sm italic text-muted">Waiting for the swarm to start…</p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="animate-slide-in-top rounded-lg border border-hairline bg-panel/60 px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <MonoTimestamp ts={item.ts} />
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: item.ok ? "var(--success)" : "var(--signal)" }}
              />
            </div>
            <p className="mt-1 font-mono text-[13px] leading-snug text-paper">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
