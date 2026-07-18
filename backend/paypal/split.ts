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

async function createCheckoutOrder(input: {
  travelerId: string;
  name: string;
  amount: number;
  dest: string;
}): Promise<{ orderId: string; approveUrl?: string; status: string }> {
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const value = money(input.amount);

  const order = await paypalFetch<CreateOrderResponse>("/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.travelerId.slice(0, 256),
          description: `Trip share — ${input.name} — ${input.dest || "company trip"}`.slice(0, 127),
          custom_id: input.travelerId.slice(0, 127),
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
 * HR payment gate: "Approve & send requests".
 * Creates one PayPal sandbox Checkout order per traveler (equal split) and
 * marks each row paypalStatus = "requested" with an approveUrl for checkout.
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
      { error: "Split already requested", split: trip.split },
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
    const split: SplitRow[] = [];
    const orders: {
      travelerId: string;
      name: string;
      amount: number;
      orderId: string;
      approveUrl?: string;
      status: string;
    }[] = [];

    for (let i = 0; i < travelers.length; i++) {
      const t = travelers[i];
      const amount = amounts[i];
      const created = await createCheckoutOrder({
        travelerId: t.id,
        name: t.name,
        amount,
        dest: trip.dest,
      });

      split.push({
        travelerId: t.id,
        amount,
        paypalStatus: "requested",
        orderId: created.orderId,
        approveUrl: created.approveUrl,
      });
      orders.push({
        travelerId: t.id,
        name: t.name,
        amount,
        orderId: created.orderId,
        approveUrl: created.approveUrl,
        status: created.status,
      });

      appendTrace({
        ts: Date.now(),
        server: "paypal",
        fn: "createOrder",
        arg: `${t.name} $${money(amount)} (${created.orderId})`,
        ok: true,
      });
    }

    updateTrip({ split });

    appendTrace({
      ts: Date.now(),
      server: "paypal",
      fn: "splitPayment",
      arg: `${travelers.length} requests · $${money(total)} total · ${mode}`,
      ok: true,
    });

    return NextResponse.json({
      ok: true,
      mode,
      total,
      currency: "USD",
      split,
      orders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "PayPal split failed";
    appendTrace({
      ts: Date.now(),
      server: "paypal",
      fn: "splitPayment",
      arg: message.slice(0, 120),
      ok: false,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
