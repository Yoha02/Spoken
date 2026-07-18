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

function moneyRound(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumLegPrices(trip: TripObject): number {
  let sum = 0;
  for (const leg of trip.legs) {
    if ("price" in leg && typeof leg.price === "number") {
      sum += leg.price;
    }
  }
  return moneyRound(sum);
}

/**
 * Full group total — never a single traveler share when n > 1.
 * The corporate account pays actual booked expenses: legs / totalCost win.
 * budgetPerPerson × headcount is only a pre-booking ESTIMATE fallback — the
 * budget is a cap, not the charge, so it must never override booked totals.
 */
function resolveBillableTotal(trip: TripObject, clientHint?: number): number {
  const n = trip.travelers.length;
  const fromLegs = sumLegPrices(trip);

  let fromCost = trip.totalCost > 0 ? moneyRound(trip.totalCost) : 0;
  // Guard: a per-person figure stored as the group total (only when it can't
  // be a coincidence — i.e. it exactly matches budget or legs ÷ n).
  if (fromCost > 0 && n > 1 && trip.budgetPerPerson > 0) {
    if (Math.abs(fromCost - trip.budgetPerPerson) < 0.02) {
      fromCost = moneyRound(trip.budgetPerPerson * n);
    }
  }
  if (fromCost > 0 && n > 1 && fromLegs > 0) {
    const per = moneyRound(fromLegs / n);
    if (Math.abs(fromCost - per) < 0.02) fromCost = fromLegs;
  }

  const booked = Math.max(fromLegs, fromCost);
  if (booked > 0) return booked;

  const hint =
    typeof clientHint === "number" && Number.isFinite(clientHint) && clientHint > 0
      ? moneyRound(clientHint)
      : 0;
  if (hint > 0) return hint;

  return trip.budgetPerPerson > 0 && n > 0 ? moneyRound(trip.budgetPerPerson * n) : 0;
}

function equalShares(total: number, count: number): number[] {
  if (count <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const rem = cents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i < rem ? 1 : 0)) / 100);
}

/** Prefer browser origin (local vs prod), then APP_URL, then localhost. */
function resolveAppBase(returnBase?: string): string {
  const fromClient = (returnBase || "").trim().replace(/\/$/, "");
  if (fromClient && /^https?:\/\//i.test(fromClient)) {
    return fromClient;
  }
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

async function createCorporateOrder(input: {
  total: number;
  dest: string;
  travelerCount: number;
  returnBase?: string;
}): Promise<{ orderId: string; approveUrl?: string; status: string }> {
  const appUrl = resolveAppBase(input.returnBase);
  const value = money(input.total);

  const order = await paypalFetch<CreateOrderResponse>("/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "corporate-trip",
          description: `Corporate travel — ${input.dest || "company trip"} — ${input.travelerCount} travelers`.slice(
            0,
            127
          ),
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
 * Corporate account pays the whole trip — one Checkout order for the full total.
 *
 * Optional JSON body: `{ totalCost?: number, returnBase?: string }`.
 */
export async function splitPayment(req: Request) {
  let bodyTotal: number | undefined;
  let returnBase: string | undefined;
  try {
    const body = (await req.json()) as { totalCost?: unknown; returnBase?: unknown };
    if (typeof body.totalCost === "number" && Number.isFinite(body.totalCost) && body.totalCost > 0) {
      bodyTotal = body.totalCost;
    }
    if (typeof body.returnBase === "string" && body.returnBase.trim()) {
      returnBase = body.returnBase.trim();
    }
  } catch {
    // Empty body is fine for live trips that already have totals.
  }

  if (!returnBase) {
    const origin = req.headers.get("origin") || req.headers.get("referer");
    if (origin) {
      try {
        returnBase = new URL(origin).origin;
      } catch {
        /* ignore */
      }
    }
  }

  const trip = getTrip();
  const travelers = trip.travelers;

  if (travelers.length === 0) {
    return NextResponse.json({ error: "No travelers on the trip" }, { status: 400 });
  }

  const total = resolveBillableTotal(trip, bodyTotal);
  if (total <= 0) {
    return NextResponse.json(
      {
        error:
          "Nothing to charge yet — set totalCost (after booking) or budgetPerPerson before approving payment",
      },
      { status: 400 }
    );
  }

  if (getTrip().totalCost !== total) {
    updateTrip({ totalCost: total });
  }

  // Reuse existing corporate order if still open and amount matches.
  if (trip.split && trip.split.length > 0) {
    const existingTotal = moneyRound(trip.split.reduce((s, r) => s + r.amount, 0));
    const alreadyPaid = trip.split.every((s) => s.paypalStatus === "paid");
    if (alreadyPaid) {
      return NextResponse.json(
        { error: "Trip already paid", split: trip.split, total: existingTotal },
        { status: 409 }
      );
    }
    if (Math.abs(existingTotal - total) < 0.02 && trip.split[0]?.approveUrl) {
      return NextResponse.json({
        ok: true,
        reused: true,
        mode: paypalMode(),
        total,
        currency: "USD",
        orderId: trip.split[0].orderId,
        approveUrl: trip.split[0].approveUrl,
        split: trip.split,
      });
    }
    // Stale undercharged order — replace.
    updateTrip({ split: undefined });
  }

  const amounts = equalShares(total, travelers.length);
  const mode = paypalMode();

  try {
    const created = await createCorporateOrder({
      total,
      dest: trip.dest,
      travelerCount: travelers.length,
      returnBase,
    });

    const split: SplitRow[] = travelers.map((t, i) => ({
      travelerId: t.id,
      amount: amounts[i],
      paypalStatus: "requested" as const,
      orderId: created.orderId,
      approveUrl: created.approveUrl,
    }));

    updateTrip({ split, totalCost: total });

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
