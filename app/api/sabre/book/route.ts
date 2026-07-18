import { NextResponse } from "next/server";

// Owner: fill in with Sabre booking/PNR creation (SABRE_CLIENT_ID /
// SABRE_CLIENT_SECRET stay server-side only).
export async function POST() {
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
