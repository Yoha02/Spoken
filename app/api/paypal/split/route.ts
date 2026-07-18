import { NextResponse } from "next/server";

// Owner: fill in with PayPal split-payment requests (PAYPAL_CLIENT_ID /
// PAYPAL_CLIENT_SECRET stay server-side only).
export async function POST() {
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
