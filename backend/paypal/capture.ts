import { NextResponse } from "next/server";
import { paypalFetch } from "@/backend/paypal/auth";
import { appendTrace, getTrip, updateTrip } from "@/core/tripObject";

type CaptureResponse = {
  id?: string;
  status?: string;
  purchase_units?: {
    payments?: {
      captures?: { id?: string; status?: string }[];
    };
  }[];
};

/**
 * Capture the corporate PayPal Checkout order after HR approves on paypal.com.
 * All breakdown rows share the one corporate order, so a successful capture
 * marks every row paypalStatus = "paid".
 */
export async function capturePayment(req: Request) {
  let orderId = "";
  try {
    const body = (await req.json()) as { orderId?: string; token?: string };
    orderId = (body.orderId || body.token || "").trim();
  } catch {
    return NextResponse.json({ error: "Expected JSON body with orderId" }, { status: 400 });
  }

  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  const trip = getTrip();
  const split = trip.split;
  if (!split || split.length === 0) {
    return NextResponse.json({ error: "No payment split on this trip" }, { status: 400 });
  }

  const matching = split.filter((s) => s.orderId === orderId);
  if (matching.length === 0) {
    return NextResponse.json({ error: `No split row for order ${orderId}` }, { status: 404 });
  }

  if (matching.every((s) => s.paypalStatus === "paid")) {
    return NextResponse.json({
      ok: true,
      alreadyPaid: true,
      orderId,
      split,
    });
  }

  try {
    const captured = await paypalFetch<CaptureResponse>(
      `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      { method: "POST", body: "{}" }
    );

    const status = captured.status ?? "UNKNOWN";
    const captureStatus = captured.purchase_units?.[0]?.payments?.captures?.[0]?.status;
    const paid =
      status === "COMPLETED" ||
      captureStatus === "COMPLETED" ||
      captureStatus === "PENDING";

    if (!paid) {
      throw new Error(`Unexpected capture status: ${status}${captureStatus ? `/${captureStatus}` : ""}`);
    }

    const next = split.map((row) =>
      row.orderId === orderId ? { ...row, paypalStatus: "paid" as const } : row
    );
    updateTrip({ split: next });

    const total = matching.reduce((sum, row) => sum + row.amount, 0);
    appendTrace({
      ts: Date.now(),
      server: "paypal",
      fn: "captureOrder",
      arg: `corporate account · $${(Math.round(total * 100) / 100).toFixed(2)} · ${orderId}`,
      ok: true,
    });

    return NextResponse.json({
      ok: true,
      orderId,
      status,
      split: next,
      allPaid: next.every((s) => s.paypalStatus === "paid"),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PayPal capture failed";
    appendTrace({
      ts: Date.now(),
      server: "paypal",
      fn: "captureOrder",
      arg: `${orderId}: ${message.slice(0, 100)}`,
      ok: false,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
