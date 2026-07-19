import { NextResponse } from "next/server";
import { createMcpSession, callMcpTool, type McpSession } from "@/backend/sabre/mcpClient";
import { getFlightMeta, getHotelMeta } from "@/backend/sabre/shopCache";
import { appendTrace, getTrip, updateTrip, type Leg } from "@/core/tripObject";

const SABRE_PCC = process.env.SABRE_PCC || "S5OM";

function trace(server: string, fn: string, arg: string, ok = true) {
  appendTrace({ ts: Date.now(), server, fn, arg, ok });
}

function unwrapToolResult<T>(result: unknown): T {
  const content = (result as { content?: { type: string; text?: string }[] })?.content;
  const text = content?.[0]?.text;
  if (!text) throw new Error("MCP tool returned no content");
  return JSON.parse(text) as T;
}

function splitName(fullName: string): { givenName: string; surname: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { givenName: parts[0], surname: "Traveler" };
  return { givenName: parts[0], surname: parts.slice(1).join(" ") };
}

function legPrice(leg: Leg): number {
  if (leg.type === "flight" || leg.type === "hotel") return leg.price;
  if (leg.type === "ride") return leg.price ?? 0;
  return 0;
}

// Cert-environment placeholder — Sabre's own docs note placeholder traveler
// data is acceptable for testing (no real DOB is collected from travelers).
const PLACEHOLDER_BIRTH_DATE = "1990-01-15";

const AGENCY = {
  address: {
    name: "Swarm Mode Travel",
    street: "700 Congress Ave",
    city: "Austin",
    stateProvince: "TX",
    postalCode: "78701",
    countryCode: "US",
    freeText: "Swarm Mode Travel\n700 Congress Ave\nAustin, TX 78701\nUS",
  },
  agencyCustomerNumber: "1234567",
  ticketingPolicy: "TODAY",
};

function bookingTravelers(names: string[]) {
  return names.map((name) => {
    const { givenName, surname } = splitName(name);
    return { givenName, surname, birthDate: PLACEHOLDER_BIRTH_DATE, passengerCode: "ADT" };
  });
}

function contactInfo(phones: string[]) {
  return {
    emails: ["travel@swarm-mode.example"],
    phones: phones.length > 0 ? phones : ["+15550000000"],
  };
}

function billingAddress() {
  return {
    name: AGENCY.address.name,
    street: AGENCY.address.street,
    city: AGENCY.address.city,
    stateProvince: AGENCY.address.stateProvince,
    postalCode: AGENCY.address.postalCode,
    countryCode: AGENCY.address.countryCode,
  };
}

// Sabre create-booking rejects CASH for hotels ("Hotel booking cannot be
// combined with: CASH form of payment") — a real card is required even in
// cert. This is a generic test card (not tied to any real account/person);
// the cert environment never actually charges it.
function testCardFormOfPayment() {
  return {
    type: "PAYMENTCARD",
    cardTypeCode: process.env.SABRE_TEST_CARD_TYPE || "VI",
    cardNumber: process.env.SABRE_TEST_CARD_NUMBER || "4111111111111111",
    cardSecurityCode: process.env.SABRE_TEST_CARD_CVV || "123",
    expiryDate: process.env.SABRE_TEST_CARD_EXPIRY || "2028-12",
    cardHolder: {
      givenName: "Swarm",
      surname: "Travel",
      email: "travel@swarm-mode.example",
      phone: "+15550000000",
      address: billingAddress(),
    },
  };
}

function extractPnr(parsed: Record<string, unknown>): string {
  return (
    (parsed.confirmationId as string) ||
    (parsed.pnr as string) ||
    (parsed.locator as string) ||
    (parsed.recordLocator as string) ||
    "PENDING"
  );
}

function dedupeFlightSegments(flightLegs: Extract<Leg, { type: "flight" }>[]) {
  const seen = new Map<string, ReturnType<typeof buildFlightSegment>>();
  for (const leg of flightLegs) {
    const meta = getFlightMeta(leg.travelerId);
    const key = `${leg.carrier}-${meta?.flightNumber}-${leg.origin}-${leg.dest}-${leg.depart}`;
    if (!seen.has(key)) seen.set(key, buildFlightSegment(leg, meta));
  }
  return Array.from(seen.values());
}

function buildFlightSegment(leg: Extract<Leg, { type: "flight" }>, meta: ReturnType<typeof getFlightMeta>) {
  return {
    flightNumber: meta?.flightNumber ?? 0,
    airlineCode: leg.carrier,
    fromAirportCode: leg.origin,
    toAirportCode: leg.dest,
    departureDate: leg.depart.split("T")[0],
    departureTime: leg.depart.split("T")[1],
    bookingClass: meta?.bookingClass ?? "Y",
    isMarriageGroup: false,
    flightStatusCode: "NN",
  };
}

async function bookFlights(session: McpSession, trip: ReturnType<typeof getTrip>, flightLegs: Extract<Leg, { type: "flight" }>[]): Promise<string | null> {
  const travelerNames = flightLegs.map((leg) => trip.travelers.find((t) => t.id === leg.travelerId)?.name ?? "Traveler");
  const phones = flightLegs
    .map((leg) => trip.travelers.find((t) => t.id === leg.travelerId)?.phone)
    .filter((p): p is string => !!p);

  const payload = {
    agency: AGENCY,
    travelers: bookingTravelers(travelerNames),
    contactInfo: contactInfo(phones),
    // CASH is accepted for flight bookings (unlike hotels) — no card needed.
    payment: { formsOfPayment: [{ type: "CASH" }], billingAddress: billingAddress() },
    flightDetails: {
      // create-booking wants each physical flight segment listed once —
      // travelers ride together implicitly via the shared travelers[] list.
      // shop.ts creates one Leg per traveler even when they share an origin
      // (for the per-traveler UI cards), so dedupe by segment here or Sabre
      // rejects it as UNABLE_TO_BOOK_FLIGHTS_DUPLICATE_SEGMENT.
      flights: dedupeFlightSegments(flightLegs),
      // Schema requires >=1 item; {} is the documented minimal value for a
      // simple stored-fare booking (no custom pricing qualifiers needed).
      flightPricing: [{}],
    },
  };

  const result = await callMcpTool(session, "create-booking", payload);
  if ((result as { isError?: boolean })?.isError) {
    const message = (result as { content?: { text?: string }[] })?.content?.[0]?.text || "create-booking (flights) failed";
    throw new Error(message);
  }
  const parsed = unwrapToolResult<Record<string, unknown>>(result);
  return extractPnr(parsed);
}

async function bookHotel(
  session: McpSession,
  trip: ReturnType<typeof getTrip>,
  hotelLeg: Extract<Leg, { type: "hotel" }>
): Promise<string> {
  const hotelMeta = getHotelMeta();
  if (!hotelMeta) throw new Error("hotel leg present but no cached hotelCode — run Sabre shop again");

  const ratesResult = await callMcpTool(session, "get-hotel-rates", {
    hotelCode: hotelMeta.hotelCode,
    checkInDate: hotelMeta.checkIn,
    checkOutDate: hotelMeta.checkOut,
  });
  const ratesParsed = unwrapToolResult<{ rooms?: { ratePlans?: { rateKey?: string }[] }[] }>(ratesResult);
  const rateKey = ratesParsed.rooms?.[0]?.ratePlans?.[0]?.rateKey;
  trace("sabre", "getHotelRates", rateKey ? `${hotelMeta.hotelCode} · rate found` : `${hotelMeta.hotelCode} · no rate available`, !!rateKey);
  if (!rateKey) throw new Error("get-hotel-rates: no rateKey available");

  const priceResult = await callMcpTool(session, "check-hotel-price", {
    hotelPriceCheckRq: { pos: { source: { pseudoCityCode: SABRE_PCC } }, rateInfoRef: { rateKey } },
  });
  type PriceCheckInfo = {
    bookingKey?: string;
    hotelRateInfo?: {
      rooms?: { numberOfAdults?: number; ratePlans?: { rateInfo?: { guarantee?: { guaranteeType?: string } } }[] }[];
    };
  };
  const priceParsed = unwrapToolResult<{ hotelPriceCheckRs?: { priceCheckInfo?: PriceCheckInfo } }>(priceResult);
  const priceCheckInfo = priceParsed.hotelPriceCheckRs?.priceCheckInfo;
  const bookingKey = priceCheckInfo?.bookingKey;
  if (!bookingKey) throw new Error("check-hotel-price: no bookingKey returned");
  trace("sabre", "checkHotelPrice", "bookingKey acquired", true);

  // Property-specific: some rates require prepaid deposit (guaranteeType
  // "DEP") vs a plain guarantee — create-booking rejects the wrong one with
  // UNABLE_TO_BOOK_HOTEL_WRONG_PAYMENT_POLICY.
  const guaranteeType = priceCheckInfo?.hotelRateInfo?.rooms?.[0]?.ratePlans?.[0]?.rateInfo?.guarantee?.guaranteeType;
  const paymentPolicy = guaranteeType === "DEP" ? "DEPOSIT" : "GUARANTEE";
  // The priced bookingKey is only valid for the occupancy it was quoted for
  // (Sabre rejects a mismatch as UNABLE_TO_BOOK_HOTEL_OCCUPANCY_MISMATCH) —
  // cap the room's traveler list to that occupancy rather than re-running
  // the rate chain per room to split the full party across multiple rooms.
  const roomOccupancy = priceCheckInfo?.hotelRateInfo?.rooms?.[0]?.numberOfAdults || 1;

  const phones = trip.travelers.map((t) => t.phone).filter(Boolean);
  const payload = {
    agency: AGENCY,
    travelers: bookingTravelers(trip.travelers.map((t) => t.name)),
    contactInfo: contactInfo(phones),
    payment: { formsOfPayment: [testCardFormOfPayment()], billingAddress: billingAddress() },
    hotel: {
      bookingKey,
      paymentPolicy,
      // A single check-hotel-price call prices one room's rate — the
      // bookingKey it returns doesn't cover a multi-room split (Sabre
      // rejects extra room entries as "Invalid number of rooms"). Book one
      // room at the priced occupancy rather than re-running the rate chain
      // per room for this demo.
      rooms: [{ travelerIndices: trip.travelers.slice(0, roomOccupancy).map((_, i) => i + 1) }],
      formOfPayment: 1,
    },
  };

  const result = await callMcpTool(session, "create-booking", payload);
  if ((result as { isError?: boolean })?.isError) {
    const message = (result as { content?: { text?: string }[] })?.content?.[0]?.text || "create-booking (hotel) failed";
    throw new Error(message);
  }
  const parsed = unwrapToolResult<Record<string, unknown>>(result);
  return extractPnr(parsed);
}

/**
 * Real Sabre booking via the MCP server's create-booking tool. Flights and
 * the hotel are booked as two independent create-booking calls (Sabre's
 * booking build is atomic per call) so a rejection on one side doesn't sink
 * an otherwise-successful booking on the other.
 */
export async function bookSabre() {
  const trip = getTrip();
  const flightLegs = trip.legs.filter((l): l is Extract<Leg, { type: "flight" }> => l.type === "flight");
  const hotelLegIndex = trip.legs.findIndex((l) => l.type === "hotel");
  const hotelLeg = hotelLegIndex >= 0 ? (trip.legs[hotelLegIndex] as Extract<Leg, { type: "hotel" }>) : undefined;

  if (flightLegs.length === 0 && !hotelLeg) {
    return NextResponse.json({ error: "No proposed legs to book — run Sabre shop first" }, { status: 400 });
  }

  const session = await createMcpSession();
  let flightPnr: string | null = null;
  let hotelPnr: string | null = null;
  let flightError: string | null = null;
  let hotelError: string | null = null;

  if (flightLegs.length > 0) {
    try {
      flightPnr = await bookFlights(session, trip, flightLegs);
      trace("sabre", "createBooking", `Flights PNR ${flightPnr}`, true);
    } catch (err) {
      flightError = err instanceof Error ? err.message : "Flight booking failed";
      trace("sabre", "createBooking", flightError.slice(0, 160), false);
    }
  }

  if (hotelLeg) {
    try {
      hotelPnr = await bookHotel(session, trip, hotelLeg);
      trace("sabre", "createBooking", `Hotel confirmation ${hotelPnr}`, true);
    } catch (err) {
      hotelError = err instanceof Error ? err.message : "Hotel booking failed";
      trace("sabre", "createBooking", hotelError.slice(0, 160), false);
    }
  }

  const legs: Leg[] = trip.legs.map((l) => {
    if (l.type === "flight" && flightPnr) return { ...l, pnr: flightPnr, status: "booked" };
    if (l.type === "hotel" && hotelPnr) return { ...l, status: "booked" };
    return l;
  });
  const totalCost = legs.reduce((sum, l) => sum + legPrice(l), 0);
  updateTrip({ legs, totalCost });

  const bookedCount = legs.filter((l) => l.status === "booked").length;
  if (bookedCount === 0) {
    return NextResponse.json({ error: flightError || hotelError || "Sabre booking failed", flightError, hotelError }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    flightPnr,
    hotelPnr,
    flightError,
    hotelError,
    totalCost,
    bookedCount,
    legCount: legs.length,
  });
}
