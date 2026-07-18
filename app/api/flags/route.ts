import { NextResponse } from "next/server";
import {
  clearFeatureFlagOverrides,
  getFeatureFlags,
  setFeatureFlagOverrides,
  type FeatureFlags,
} from "@/core/featureFlags";

export async function GET() {
  return NextResponse.json({
    flags: getFeatureFlags(),
    source: "env+runtime",
  });
}

/**
 * Body: `{ vocalBridgeCallsEnabled?: boolean, reset?: true }`
 * Runtime override only — does not rewrite .env.local.
 */
export async function POST(req: Request) {
  let body: Partial<FeatureFlags> & { reset?: boolean } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  if (body.reset) {
    return NextResponse.json({ flags: clearFeatureFlagOverrides(), reset: true });
  }

  const patch: Partial<FeatureFlags> = {};
  if (typeof body.vocalBridgeCallsEnabled === "boolean") {
    patch.vocalBridgeCallsEnabled = body.vocalBridgeCallsEnabled;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Provide vocalBridgeCallsEnabled (boolean) or reset: true" },
      { status: 400 }
    );
  }

  return NextResponse.json({ flags: setFeatureFlagOverrides(patch) });
}
