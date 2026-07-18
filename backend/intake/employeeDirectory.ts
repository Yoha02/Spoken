import type { Traveler } from "@/core/tripObject";

/** Demo HR directory: Landing AI returns names; phones are resolved here. */
export type DirectoryEmployee = {
  id: string;
  name: string;
  phone: string; // E.164
};

/**
 * Read phones at call time (not module load). Top-level env reads can stick to
 * empty defaults under Next.js HMR / cold load before .env.local is applied.
 */
export function getEmployeeDirectory(): DirectoryEmployee[] {
  return [
    {
      id: "ravi",
      name: "Ravi",
      phone: (process.env.EMPLOYEE_PHONE_RAVI || "+15550000001").trim(),
    },
    {
      id: "aashna",
      name: "Aashna",
      phone: (process.env.EMPLOYEE_PHONE_AASHNA || "+15550000002").trim(),
    },
    {
      id: "nikhil",
      name: "Nikhil",
      phone: (process.env.EMPLOYEE_PHONE_NIKHIL || "+15550000003").trim(),
    },
    {
      id: "eyoha",
      name: "Eyoha",
      phone: (process.env.EMPLOYEE_PHONE_EYOHA || "+15550000004").trim(),
    },
  ];
}

/** @deprecated Prefer getEmployeeDirectory() so phones pick up current env. */
export const EMPLOYEE_DIRECTORY: DirectoryEmployee[] = getEmployeeDirectory();

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Case-insensitive exact match, then first-name / startsWith. */
export function resolveEmployees(names: string[]): {
  matched: Traveler[];
  unmatched: string[];
} {
  const directory = getEmployeeDirectory();
  const unmatched: string[] = [];
  const matched: Traveler[] = [];
  const usedIds = new Set<string>();

  for (const raw of names) {
    const key = normalize(raw);
    if (!key) continue;

    const hit =
      directory.find((e) => normalize(e.name) === key) ??
      directory.find(
        (e) =>
          normalize(e.name).startsWith(key) ||
          key.startsWith(normalize(e.name)) ||
          normalize(e.name).split(" ")[0] === key.split(" ")[0]
      );

    if (!hit || usedIds.has(hit.id)) {
      unmatched.push(raw.trim());
      continue;
    }

    usedIds.add(hit.id);
    matched.push({
      id: hit.id,
      name: hit.name,
      phone: hit.phone,
      callStatus: "idle",
      transcript: [],
    });
  }

  return { matched, unmatched };
}

/** Refresh phones on existing travelers from the live directory (by id). */
export function applyDirectoryPhones(travelers: Traveler[]): Traveler[] {
  const byId = new Map(getEmployeeDirectory().map((e) => [e.id, e]));
  return travelers.map((t) => {
    const hit = byId.get(t.id);
    if (!hit) return t;
    return { ...t, phone: hit.phone };
  });
}
