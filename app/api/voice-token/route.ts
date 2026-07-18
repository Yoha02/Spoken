import { NextResponse } from "next/server";

// Owner: fill in with VocalBridge token minting (server-side only — never expose
// VOCALBRIDGE_API_KEY to the browser).
export async function POST() {
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}

export async function GET() {
  return NextResponse.json({ error: "not implemented" }, { status: 501 });
}
