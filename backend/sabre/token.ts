import { NextResponse } from "next/server";
import { getSabreToken } from "@/backend/sabre/auth";
import { appendTrace } from "@/core/tripObject";

// Diagnostic route — confirms SABRE_* credentials are wired up correctly
// without needing the actual shop/book APIs implemented yet. Does not
// return the token itself.
export async function checkSabreToken() {
  try {
    await getSabreToken();
    appendTrace({ ts: Date.now(), server: "sabre", fn: "getSabreToken", arg: "", ok: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sabre auth failed";
    appendTrace({ ts: Date.now(), server: "sabre", fn: "getSabreToken", arg: "", ok: false });
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
