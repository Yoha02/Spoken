"use client";

import dynamic from "next/dynamic";

const Canvas = dynamic(() => import("@/ui/canvas/Canvas"), {
  ssr: false,
  loading: () => (
    <main className="flex min-h-screen items-center justify-center bg-bg">
      <p className="font-mono text-2xl text-muted">Connecting to swarm...</p>
    </main>
  ),
});

export default function Page() {
  return <Canvas />;
}
