// Runtime + env feature flags. Env is the default; POST /api/flags can
// override for the life of the server process (handy while iterating demos
// without restarting next dev).

export type FeatureFlags = {
  /**
   * When true, Start swarm / import auto-swarm places real Vocal Bridge calls.
   * When false (preview), the swarm plays the paced server-side timeline:
   * call highlights + prefs, then staged Sabre shop/book → PayPal-ready.
   */
  vocalBridgeCallsEnabled: boolean;
};

type RuntimeOverrides = Partial<FeatureFlags>;

const globalForFlags = globalThis as unknown as {
  __featureFlagOverrides?: RuntimeOverrides;
};

function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") return defaultValue;
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return defaultValue;
}

/** Defaults from env. Real calls default OFF so limited Vocal Bridge quota is safe. */
export function envFeatureFlags(): FeatureFlags {
  return {
    // VOCALBRIDGE_CALLS_ENABLED=true → real dials. Unset / false → preview.
    vocalBridgeCallsEnabled: envBool("VOCALBRIDGE_CALLS_ENABLED", false),
  };
}

export function getFeatureFlags(): FeatureFlags {
  const base = envFeatureFlags();
  const overrides = globalForFlags.__featureFlagOverrides ?? {};
  return { ...base, ...overrides };
}

export function setFeatureFlagOverrides(patch: RuntimeOverrides): FeatureFlags {
  globalForFlags.__featureFlagOverrides = {
    ...(globalForFlags.__featureFlagOverrides ?? {}),
    ...patch,
  };
  return getFeatureFlags();
}

export function clearFeatureFlagOverrides(): FeatureFlags {
  globalForFlags.__featureFlagOverrides = {};
  return getFeatureFlags();
}

export function isVocalBridgeCallsEnabled(): boolean {
  return getFeatureFlags().vocalBridgeCallsEnabled;
}

/** Human label for logs / UI. Preview = server-simulated calls + booking. */
export function vocalBridgeModeLabel(): "live" | "preview" {
  return isVocalBridgeCallsEnabled() ? "live" : "preview";
}

/**
 * PREVIEW_FAST=true collapses preview pacing to ~instant — handy while
 * iterating on the PayPal flow without sitting through the paced timeline.
 */
export function isPreviewFast(): boolean {
  return envBool("PREVIEW_FAST", false);
}
