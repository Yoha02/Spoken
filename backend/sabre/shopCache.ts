// Ephemeral, in-memory handoff between shop.ts and book.ts for the raw
// Sabre fields booking needs that don't belong on the shared TripObject
// (core/tripObject.ts's Leg type is a hard contract — see AGENTS.md).
// Survives Next.js dev hot-reload via globalThis, same pattern as
// core/tripObject.ts's own singleton.

export type FlightBookingMeta = {
  flightNumber: number;
  bookingClass: string;
  origin: string;
  dest: string;
  departureDate: string;
  departureTime: string;
};

export type HotelBookingMeta = {
  hotelCode: string;
  checkIn: string;
  checkOut: string;
};

type ShopCache = {
  flightsByTraveler: Map<string, FlightBookingMeta>;
  hotel: HotelBookingMeta | null;
};

const globalForShopCache = globalThis as unknown as { __sabreShopCache?: ShopCache };
const cache: ShopCache = globalForShopCache.__sabreShopCache ?? { flightsByTraveler: new Map(), hotel: null };
globalForShopCache.__sabreShopCache = cache;

export function setFlightMeta(travelerId: string, meta: FlightBookingMeta) {
  cache.flightsByTraveler.set(travelerId, meta);
}

export function getFlightMeta(travelerId: string): FlightBookingMeta | undefined {
  return cache.flightsByTraveler.get(travelerId);
}

export function setHotelMeta(meta: HotelBookingMeta | null) {
  cache.hotel = meta;
}

export function getHotelMeta(): HotelBookingMeta | null {
  return cache.hotel;
}

export function clearShopCache() {
  cache.flightsByTraveler.clear();
  cache.hotel = null;
}
