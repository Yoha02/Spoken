import { NextResponse } from "next/server";

// Owner: PayPal teammate. Fill in with PayPal split-payment requests
// (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET stay server-side only) — this
// is what the dashboard's payment gate calls on "Approve & send requests".
export async function splitPayment() {
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
