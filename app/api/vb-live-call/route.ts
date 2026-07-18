import { NextResponse } from "next/server";
import { placeOutboundCall } from "@/agent/vocalbridge/client";
import { appendTrace, getTrip, updateTrip } from "@/core/tripObject";

// Hidden recording helper: places a REAL Vocal Bridge outbound call to Yoha,
// regardless of VOCALBRIDGE_CALLS_ENABLED (preview mode stays on for the rest
// of the flow). Triggered by the invisible click target on the dashboard's
// "Total vs. budget" label.
export async function POST() {
  const travelerId = "eyoha";
  const phone = (process.env.EMPLOYEE_PHONE_EYOHA || "").trim();

  if (!phone) {
    return NextResponse.json(
      { error: "EMPLOYEE_PHONE_EYOHA is not configured" },
      { status: 400 }
    );
  }

  try {
    const call = await placeOutboundCall({
      phoneNumber: phone,
      name: "Yoha",
      travelerId,
    });

    // Reflect the live call on the dashboard if Yoha is on the roster.
    const travelers = getTrip().travelers.map((t) =>
      t.id === travelerId ? { ...t, callStatus: "ringing" as const } : t
    );
    updateTrip({ travelers });

    appendTrace({
      ts: Date.now(),
      server: "vocalbridge",
      fn: "placeOutboundCall",
      arg: `Yoha ${phone}`,
      ok: true,
    });

    return NextResponse.json({ ok: true, callId: call.callId, status: call.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Vocal Bridge call failed";
    appendTrace({
      ts: Date.now(),
      server: "vocalbridge",
      fn: "placeOutboundCall",
      arg: `Yoha: ${message.slice(0, 80)}`,
      ok: false,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
