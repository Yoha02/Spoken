import { appendTrace, getTrip, updateTrip, type Leg } from "@/core/tripObject";
import { isPreviewFast } from "@/core/featureFlags";

function sleep(ms: number) {
  const scale = isPreviewFast() ? 0.02 : 1;
  return new Promise((r) => setTimeout(r, Math.max(10, Math.round(ms * scale))));
}

function moneyRound(n: number): number {
  return Math.round(n * 100) / 100;
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic realistic record locator, e.g. "MXQJTR". */
function pnrFor(seed: string): string {
  const letters = "BCDFGHJKLMNPQRSTVWXZ";
  let h = hashId(seed);
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += letters[h % letters.length];
    h = Math.floor(h / letters.length) + 7;
  }
  return out;
}

function pushLeg(leg: Leg) {
  updateTrip({ legs: [...getTrip().legs, leg] });
}

function patchLeg(index: number, patch: Partial<Leg>) {
  const legs = getTrip().legs.map((l, i) => (i === index ? ({ ...l, ...patch } as Leg) : l));
  updateTrip({ legs });
}

function trace(server: string, fn: string, arg: string, ok = true) {
  appendTrace({ ts: Date.now(), server, fn, arg, ok });
}

/**
 * Preview booking timeline: paced Sabre flight/hotel search → legs proposed
 * one by one → everything booked with realistic record locators → totalCost.
 * Runs after the preview call swarm so origins/seats come from the calls.
 */
export async function runPreviewBooking(): Promise<{
  ok: true;
  totalCost: number;
  legCount: number;
}> {
  const trip = getTrip();
  const destCode = (trip.dest || "AUS").slice(0, 3).toUpperCase();
  const checkIn = trip.dateRange?.[0] || "2026-08-17";
  const checkOut = trip.dateRange?.[1] || "2026-08-21";

  const flyers = trip.travelers.filter((t) => t.callStatus === "done" || t.origin);
  const party = flyers.length > 0 ? flyers : trip.travelers;

  const nights = (() => {
    const a = new Date(`${checkIn}T00:00:00Z`).getTime();
    const b = new Date(`${checkOut}T00:00:00Z`).getTime();
    const n = Math.round((b - a) / 86_400_000);
    return Number.isFinite(n) && n > 0 ? n : 4;
  })();
  const rooms = Math.max(1, Math.ceil(party.length / 2));

  // Start from a clean slate so re-runs don't stack legs.
  updateTrip({ legs: [], totalCost: 0, split: undefined });

  // ── Shop ─────────────────────────────────────────────────────────────────
  trace("sabre", "getSabreToken", "");
  await sleep(1400);

  const origins = Array.from(new Set(party.map((t) => (t.origin || "SFO").slice(0, 3).toUpperCase())));
  for (const origin of origins) {
    const options = 9 + (hashId(origin) % 6);
    const from = 248 + (hashId(origin) % 40);
    trace("sabre", "shopFlights", `${origin} → ${destCode} · ${options} options · nonstop from $${from}`);
    await sleep(1800);
  }

  const departIso = `${checkIn}T09:05`;
  const arriveIso = `${checkIn}T14:35`;
  const flightPrices = new Map<string, number>();

  for (const t of party) {
    const origin = (t.origin || "SFO").slice(0, 3).toUpperCase();
    const price = 278 + (hashId(t.id) % 70);
    flightPrices.set(t.id, price);
    pushLeg({
      type: "flight",
      travelerId: t.id,
      origin,
      dest: destCode,
      depart: departIso,
      arrive: arriveIso,
      carrier: "AA",
      price,
      status: "proposed",
    });
    await sleep(1500);
  }

  trace("sabre", "shopHotels", `${destCode} downtown · ${nights} nights · ${rooms} room(s)`);
  await sleep(1600);

  const hotelPrice = moneyRound(178 * nights * rooms);
  const hotelIndex = getTrip().legs.length;
  pushLeg({
    type: "hotel",
    name: "Kimber Modern",
    checkIn,
    checkOut,
    rooms,
    price: hotelPrice,
    status: "proposed",
  });
  await sleep(1500);

  const ridePrice = 96;
  const rideIndex = getTrip().legs.length;
  const hasNikhil = party.some((t) => t.id === "nikhil");
  pushLeg({
    type: "ride",
    note: `Uber · airport ↔ hotel transfers${hasNikhil ? " · Fremont pickup for Nikhil" : ""} · $${ridePrice}`,
    price: ridePrice,
    status: "proposed",
  });
  await sleep(1500);

  // Group dinner the evening after check-in.
  const dinnerTime = (() => {
    const d = new Date(`${checkIn}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return `${checkIn}T19:30`;
    d.setUTCDate(d.getUTCDate() + 1);
    return `${d.toISOString().slice(0, 10)}T19:30`;
  })();
  const vegCount = party.filter((t) => (t.diet || "").toLowerCase().includes("veg")).length;
  const dinnerIndex = getTrip().legs.length;
  pushLeg({
    type: "dinner",
    place: "Uchi",
    time: dinnerTime,
    partySize: party.length,
    notes: vegCount > 0 ? `${vegCount} vegetarian` : undefined,
    status: "calling",
  });

  // ── Book ─────────────────────────────────────────────────────────────────
  await sleep(2200);

  const groupPnr = pnrFor(`${destCode}-${checkIn}-${party.map((t) => t.id).join(",")}`);
  getTrip().legs.forEach((leg, i) => {
    if (leg.type === "flight") patchLeg(i, { pnr: groupPnr, status: "booked" });
  });
  trace("sabre", "createBooking", `${party.length} flights ${origins.join("/")} → ${destCode} · PNR ${groupPnr}`);
  await sleep(1600);

  patchLeg(hotelIndex, { status: "booked" });
  trace("sabre", "createBooking", `Kimber Modern · ${nights} nights · conf ${pnrFor(`hotel-${checkIn}`)}`);
  await sleep(1400);

  patchLeg(rideIndex, { status: "booked" });
  trace("uber", "scheduleRide", `airport ↔ hotel${hasNikhil ? " + Fremont pickup" : ""} · $${ridePrice}`);
  await sleep(1400);

  patchLeg(dinnerIndex, { status: "booked" });
  trace("opentable", "reserve", `Uchi · party of ${party.length}${vegCount ? ` · ${vegCount} vegetarian` : ""}`);
  await sleep(900);

  const flightsTotal = Array.from(flightPrices.values()).reduce((a, b) => a + b, 0);
  const totalCost = moneyRound(flightsTotal + hotelPrice + ridePrice);
  updateTrip({ totalCost });

  return { ok: true, totalCost, legCount: getTrip().legs.length };
}
