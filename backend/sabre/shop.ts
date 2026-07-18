import { NextResponse } from "next/server";

// Owner: Sabre teammate. Fill in with Sabre flight/hotel shopping
// (SABRE_CLIENT_ID / SABRE_CLIENT_SECRET stay server-side only — use
// getSabreToken() from backend/sabre/auth.ts for auth).
export async function shopSabre() {
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
