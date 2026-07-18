import { NextResponse } from "next/server";
import { paypalFetch, paypalMode } from "@/backend/paypal/auth";
import { appendTrace, getTrip, updateTrip, type TripObject } from "@/core/tripObject";

export type SplitRow = NonNullable<TripObject["split"]>[number];

type CreateOrderResponse = {
  id?: string;
  status?: string;
  links?: { href: string; rel: string; method: string }[];
};

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** Prefer booked total; fall back to budget × travelers for demo before Sabre fills totalCost. */
function resolveBillableTotal(trip: TripObject): number {
  if (trip.totalCost > 0) return trip.totalCost;
  if (trip.budgetPerPerson > 0 && trip.travelers.length > 0) {
    return trip.budgetPerPerson * trip.travelers.length;
  }
  return 0;
}

function equalShares(total: number, count: number): number[] {
  if (count <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const rem = cents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i < rem ? 1 : 0)) / 100);
}

async function createCorporateOrder(input: {
  total: number;
  dest: string;
  travelerCount: number;
}): Promise<{ orderId: string; approveUrl?: string; status: string }> {
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const value = money(input.total);

  const order = await paypalFetch<CreateOrderResponse>("/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "corporate-trip",
          description: `Corporate travel — ${input.dest || "company trip"} — ${input.travelerCount} travelers`.slice(0, 127),
          custom_id: "corporate-trip",
          amount: {
            currency_code: "USD",
            value,
          },
        },
      ],
      application_context: {
        brand_name: "Swarm Mode",
        landing_page: "LOGIN",
        user_action: "PAY_NOW",
        return_url: `${appUrl}/?paypal=return`,
        cancel_url: `${appUrl}/?paypal=cancel`,
      },
    }),
  });

  if (!order.id) {
    throw new Error("PayPal order response missing id");
  }

  const approveUrl = order.links?.find((l) => l.rel === "approve")?.href;
  return {
    orderId: order.id,
    approveUrl,
    status: order.status ?? "CREATED",
  };
}

/**
 * HR expense gate: "Authorize payment".
 * This is a corporate account paying the whole trip — travelers are never
 * charged. Creates ONE PayPal Checkout order for the full total; the split
 * rows are the per-traveler expense breakdown and all share that order, so
 * they flip to "paid" together when the corporate checkout captures.
 *
 * Optional JSON body: `{ totalCost?: number }` — used when the live trip
 * does not yet have a booked total (e.g. preview/demo with final totals).
 */
export async function splitPayment(req: Request) {
  let bodyTotal: number | undefined;
  try {
    const body = (await req.json()) as { totalCost?: unknown };
    if (typeof body.totalCost === "number" && Number.isFinite(body.totalCost) && body.totalCost > 0) {
      bodyTotal = body.totalCost;
    }
  } catch {
    // Empty body is fine for live trips that already have totals.
  }

  const trip = getTrip();
  const travelers = trip.travelers;

  if (travelers.length === 0) {
    return NextResponse.json({ error: "No travelers on the trip" }, { status: 400 });
  }

  if (trip.split && trip.split.length > 0) {
    return NextResponse.json(
      { error: "Payment already authorized", split: trip.split },
      { status: 409 }
    );
  }

  // Prefer client-provided final total when the in-memory trip has none yet.
  if (bodyTotal && trip.totalCost <= 0) {
    updateTrip({ totalCost: bodyTotal });
  }

  const total = resolveBillableTotal(getTrip());
  if (total <= 0) {
    return NextResponse.json(
      {
        error:
          "Nothing to charge yet — set totalCost (after booking) or budgetPerPerson before approving payment",
      },
      { status: 400 }
    );
  }

  // Sync totalCost if we only had budget so the UI matches the charge.
  if (getTrip().totalCost <= 0) {
    updateTrip({ totalCost: total });
  }

  const amounts = equalShares(total, travelers.length);
  const mode = paypalMode();

  try {
    const created = await createCorporateOrder({
      total,
      dest: trip.dest,
      travelerCount: travelers.length,
    });

    // Per-traveler rows are the expense breakdown; they all reference the
    // single corporate order and settle together on capture.
    const split: SplitRow[] = travelers.map((t, i) => ({
      travelerId: t.id,
      amount: amounts[i],
      paypalStatus: "requested",
      orderId: created.orderId,
      approveUrl: created.approveUrl,
    }));

    updateTrip({ split });

    appendTrace({
      ts: Date.now(),
      server: "paypal",
      fn: "createOrder",
      arg: `corporate account · $${money(total)} (${created.orderId})`,
      ok: true,
    });

    return NextResponse.json({
      ok: true,
      mode,
      total,
      currency: "USD",
      orderId: created.orderId,
      approveUrl: created.approveUrl,
      split,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PayPal order failed";
    appendTrace({
      ts: Date.now(),
      server: "paypal",
      fn: "createOrder",
      arg: message.slice(0, 120),
      ok: false,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
