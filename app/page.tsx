"use client";

import dynamic from "next/dynamic";

// Stream-driven panel: skip SSR so the first paint never hydrates against a
// server tree that can't know EventSource state (avoids hydration mismatches).
const Dashboard = dynamic(() => import("@/ui/dashboard/Dashboard"), {
  ssr: false,
  loading: () => (
    <main className="flex min-h-screen items-center justify-center bg-bg">
      <p className="font-mono text-muted">Connecting...</p>
    </main>
  ),
});

export default function Page() {
  return <Dashboard />;
}
