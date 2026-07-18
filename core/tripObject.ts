// core/tripObject.ts — the single source of truth. One in-memory object per
// demo session. This is the shared contract every domain (agent/, backend/,
// ui/) depends on — change the type shape only with the team's sign-off.
export type Traveler = {
  id: string;            // "nikhil" | "priya" | "marco" | "sam"
  name: string;
  phone: string;         // E.164, e.g. "+14155551234"
  origin?: string;       // IATA city, e.g. "SFO" — filled by the call
  seat?: "aisle" | "window" | "any";
  diet?: string;         // "vegetarian" | "gluten-free" | "none"
  callStatus: "idle" | "ringing" | "live" | "done" | "failed";
  transcript: string[];  // streamed lines from this traveler's call
};

export type Leg =
  | { type: "flight"; travelerId: string; origin: string; dest: string;
      depart: string; arrive: string; carrier: string; price: number;
      pnr?: string; status: "proposed" | "booked" }
  | { type: "hotel"; name: string; checkIn: string; checkOut: string;
      rooms: number; price: number; status: "proposed" | "booked" }
  | { type: "dinner"; place: string; time: string; partySize: number;
      notes?: string; status: "calling" | "booked" | "failed" }
  | { type: "ride"; note: string; price?: number; status: "proposed" | "booked" };

export type GuardianEvent = {
  ts: number;
  /** ok = on-time milestone, alert = disruption, heal = self-heal action, info = notification */
  kind: "ok" | "alert" | "heal" | "info";
  message: string;
};

export type GuardianState = {
  /** green = all clear, red = disruption detected, healing = self-heal in progress */
  status: "green" | "red" | "healing";
  /** Post-booking flight tracking milestones + self-heal actions, in order. */
  events: GuardianEvent[];
};

export type TripObject = {
  sessionId: string;
  /** "preview" when the current run is server-simulated; "live" for real calls. */
  mode?: "live" | "preview";
  /** Trip Guardian: post-confirmation flight tracking + self-heal. Unset until armed. */
  guardian?: GuardianState;
  dest: string;          // "AUS"
  dateRange: [string, string];
  budgetPerPerson: number;
  travelers: Traveler[];
  legs: Leg[];
  totalCost: number;
  split?: {
    travelerId: string;
    amount: number;
    paypalStatus: "pending" | "requested" | "paid";
    /** PayPal Checkout order id (sandbox/live). */
    orderId?: string;
    /** Buyer approval URL from the order links (rel=approve). */
    approveUrl?: string;
  }[];
  toolTrace: { ts: number; server: string; fn: string; arg: string; ok: boolean }[];
};

function seedTrip(): TripObject {
  // Static process.env.* access so Next.js loads these from .env.local.
  const ravi = (process.env.EMPLOYEE_PHONE_RAVI || "+15550000001").trim();
  const aashna = (process.env.EMPLOYEE_PHONE_AASHNA || "+15550000002").trim();
  const nikhil = (process.env.EMPLOYEE_PHONE_NIKHIL || "+15550000003").trim();
  const eyoha = (process.env.EMPLOYEE_PHONE_EYOHA || "+15550000004").trim();

  return {
    sessionId: "demo-session-1",
    // dest/dateRange/budgetPerPerson start blank — the group email fills
    // these in via /api/import-email once it's imported.
    dest: "",
    dateRange: ["", ""],
    budgetPerPerson: 0,
    travelers: [
      { id: "ravi", name: "Ravi", phone: ravi, callStatus: "idle", transcript: [] },
      { id: "aashna", name: "Aashna", phone: aashna, callStatus: "idle", transcript: [] },
      { id: "nikhil", name: "Nikhil", phone: nikhil, callStatus: "idle", transcript: [] },
      { id: "eyoha", name: "Eyoha", phone: eyoha, callStatus: "idle", transcript: [] },
    ],
    legs: [],
    totalCost: 0,
    toolTrace: [],
  };
}

// Survive Next.js dev server hot-reload by stashing the singleton on globalThis.
const globalForTrip = globalThis as unknown as { __tripObject?: TripObject };

const trip: TripObject = globalForTrip.__tripObject ?? seedTrip();
globalForTrip.__tripObject = trip;

type Listener = (trip: TripObject) => void;
const globalForListeners = globalThis as unknown as { __tripListeners?: Set<Listener> };
const listeners: Set<Listener> = globalForListeners.__tripListeners ?? new Set();
globalForListeners.__tripListeners = listeners;

function notify() {
  Array.from(listeners).forEach((listener) => listener(trip));
}

export function subscribeTrip(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTrip(): TripObject {
  return trip;
}

export function updateTrip(patch: Partial<TripObject>): TripObject {
  Object.assign(trip, patch);
  notify();
  return trip;
}

export function appendTranscript(travelerId: string, line: string): TripObject {
  const traveler = trip.travelers.find((t) => t.id === travelerId);
  if (traveler) {
    traveler.transcript.push(line);
    notify();
  }
  return trip;
}

export function appendTrace(entry: { ts: number; server: string; fn: string; arg: string; ok: boolean }): TripObject {
  trip.toolTrace.push(entry);
  notify();
  return trip;
}

export function setGuardianStatus(status: GuardianState["status"]): TripObject {
  trip.guardian = { status, events: trip.guardian?.events ?? [] };
  notify();
  return trip;
}

export function appendGuardianEvent(event: GuardianEvent): TripObject {
  if (!trip.guardian) {
    trip.guardian = { status: "green", events: [] };
  }
  trip.guardian.events.push(event);
  notify();
  return trip;
}

// Monotonic run counter: background preview timelines capture the generation
// at start and abort as soon as a newer run bumps it, so a re-trigger never
// has two timelines writing into the same trip.
const globalForRun = globalThis as unknown as { __runGeneration?: number };

export function getRunGeneration(): number {
  return globalForRun.__runGeneration ?? 0;
}

export function bumpRunGeneration(): number {
  globalForRun.__runGeneration = getRunGeneration() + 1;
  return globalForRun.__runGeneration;
}

/**
 * Fresh take: clears everything a demo run produces (legs, costs, payment
 * split, tool feed, call state/prefs on travelers) while keeping the roster.
 * Called whenever a new extract/trigger comes in so every recording starts clean.
 */
export function resetTripForRun(): TripObject {
  bumpRunGeneration();
  trip.dest = "";
  trip.dateRange = ["", ""];
  trip.budgetPerPerson = 0;
  trip.legs = [];
  trip.totalCost = 0;
  trip.split = undefined;
  trip.toolTrace = [];
  trip.mode = undefined;
  trip.guardian = undefined;
  trip.travelers = trip.travelers.map((t) => ({
    ...t,
    origin: undefined,
    seat: undefined,
    diet: undefined,
    callStatus: "idle",
    transcript: [],
  }));
  notify();
  return trip;
}
