import { getTrip, subscribeTrip } from "@/core/tripObject";

// Shared SSE plumbing — pushes the full TripObject to every subscriber
// whenever core/tripObject.ts notifies a change. Not owned by any single
// domain; touch it only on behalf of the whole team.
export async function streamTrip() {
  const encoder = new TextEncoder();
  let unsubscribe: () => void = () => {};
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Push current state immediately so late subscribers aren't stuck waiting.
      send(getTrip());

      unsubscribe = subscribeTrip((trip) => send(trip));

      // Keep intermediary proxies (e.g. ngrok) from closing the idle connection.
      heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);
    },
    cancel() {
      clearInterval(heartbeat);
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
