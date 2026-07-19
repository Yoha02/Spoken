import { NextResponse } from "next/server";
import { createMcpSession, callMcpTool, type McpSession } from "@/backend/sabre/mcpClient";
import { clearShopCache, setFlightMeta, setHotelMeta } from "@/backend/sabre/shopCache";
import { appendTrace, getTrip, updateTrip, type Leg } from "@/core/tripObject";

const SABRE_PCC = process.env.SABRE_PCC || "S5OM";

function moneyRound(n: number): number {
  return Math.round(n * 100) / 100;
}

function airportCode(raw: string, fallback: string): string {
  const trimmed = (raw || "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(trimmed)) return trimmed;
  // Best-effort fallback matching the existing preview-path convention —
  // real city→IATA resolution is out of scope here.
  const sliced = trimmed.slice(0, 3);
  return /^[A-Z]{3}$/.test(sliced) ? sliced : fallback;
}

function trace(server: string, fn: string, arg: string, ok = true) {
  appendTrace({ ts: Date.now(), server, fn, arg, ok });
}

// The MCP tool response wraps the actual JSON payload as a text content block.
function unwrapToolResult<T>(result: unknown): T {
  const content = (result as { content?: { type: string; text?: string }[] })?.content;
  const text = content?.[0]?.text;
  if (!text) throw new Error("MCP tool returned no content");
  return JSON.parse(text) as T;
}

type FlightSearchResponse = {
  flights: {
    id: string;
    departureAirportCode: string;
    arrivalAirportCode: string;
    departureDate: string;
    departureTime: string;
    arrivalDate: string;
    arrivalTime: string;
    operatingAirlineCode: string;
    operatingFlightNumber: number;
  }[];
  offers: {
    id: string;
    totalPrice: { amount: string; currencyCode: string };
    items: {
      fares: {
        validatingAirlineCode: string;
        fareComponents: { segmentDetails: { bookingClassCode: string }[] }[];
      }[];
    }[];
  }[];
};

type HotelSearchResponse = {
  hotels: {
    hotel: { hotelCode: string; hotelName: string };
    rateDetails: { averageNightlyRate: number; currencyCode: string; rateKey: string };
  }[];
};

async function searchFlightsFor(
  session: McpSession,
  origin: string,
  dest: string,
  date: string
): Promise<
  | {
      carrier: string;
      flightNumber: number;
      bookingClass: string;
      departTime: string;
      arriveTime: string;
      price: number;
    }
  | null
> {
  const result = await callMcpTool(session, "search-flights", {
    journeys: [{ departureLocation: { airportCode: origin }, arrivalLocation: { airportCode: dest }, departureDate: date }],
    travelers: [{ passengerTypeCode: "ADT" }],
    processingOptions: { limitNumberOfOffers: 3 },
  });
  const parsed = unwrapToolResult<FlightSearchResponse>(result);
  const flight = parsed.flights?.[0];
  const offer = parsed.offers?.[0];
  if (!flight || !offer) return null;

  const bookingClass =
    offer.items?.[0]?.fares?.[0]?.fareComponents?.[0]?.segmentDetails?.[0]?.bookingClassCode || "Y";

  return {
    carrier: flight.operatingAirlineCode,
    flightNumber: flight.operatingFlightNumber,
    bookingClass,
    departTime: `${flight.departureDate}T${flight.departureTime}`,
    arriveTime: `${flight.arrivalDate}T${flight.arrivalTime}`,
    price: moneyRound(Number(offer.totalPrice?.amount ?? 0)),
  };
}

async function searchHotelsAt(
  session: McpSession,
  destAirport: string,
  checkIn: string,
  checkOut: string
): Promise<{ name: string; hotelCode: string; nightlyRate: number } | null> {
  const result = await callMcpTool(session, "search-hotels", {
    radiusInMiles: 15,
    checkInDate: checkIn,
    checkOutDate: checkOut,
    referencePoint: { type: "Airport", value: destAirport, valueContext: "CODE" },
    pos: { source: { pseudoCityCode: SABRE_PCC } },
    maxResults: 5,
    sortBy: "AverageNightlyRate",
    sortOrder: "ASC",
  });
  const parsed = unwrapToolResult<HotelSearchResponse>(result);
  const top = parsed.hotels?.[0];
  if (!top) return null;

  return {
    name: top.hotel.hotelName,
    hotelCode: top.hotel.hotelCode,
    nightlyRate: moneyRound(top.rateDetails.averageNightlyRate),
  };
}

/**
 * Real Sabre flight + hotel shopping via the MCP server (search-flights,
 * search-hotels). Writes proposed legs onto the TripObject — book.ts later
 * confirms them (real PNR, status → booked).
 */
export async function shopSabre() {
  const trip = getTrip();
  if (!trip.dest) {
    return NextResponse.json({ error: "No destination on the trip yet" }, { status: 400 });
  }
  if (trip.travelers.length === 0) {
    return NextResponse.json({ error: "No travelers on the trip yet" }, { status: 400 });
  }

  const destCode = airportCode(trip.dest, "AUS");
  const checkIn = trip.dateRange?.[0] || new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const checkOut = trip.dateRange?.[1] || new Date(Date.now() + 33 * 86_400_000).toISOString().slice(0, 10);
  const party = trip.travelers;
  const rooms = Math.max(1, Math.ceil(party.length / 2));
  const nights = Math.max(
    1,
    Math.round((new Date(`${checkOut}T00:00:00Z`).getTime() - new Date(`${checkIn}T00:00:00Z`).getTime()) / 86_400_000)
  );

  // Clean slate so re-shopping doesn't stack duplicate legs.
  updateTrip({ legs: [], totalCost: 0, split: undefined });
  clearShopCache();

  try {
    const session = await createMcpSession();

    const origins = Array.from(new Set(party.map((t) => airportCode(t.origin || "", "SFO"))));
    const flightByOrigin = new Map<string, Awaited<ReturnType<typeof searchFlightsFor>>>();

    for (const origin of origins) {
      const flight = await searchFlightsFor(session, origin, destCode, checkIn);
      flightByOrigin.set(origin, flight);
      trace(
        "sabre",
        "shopFlights",
        flight
          ? `${origin} → ${destCode} · ${flight.carrier}${flight.flightNumber} · $${flight.price}`
          : `${origin} → ${destCode} · no offers`,
        !!flight
      );
    }

    const legs: Leg[] = [];
    for (const t of party) {
      const origin = airportCode(t.origin || "", "SFO");
      const flight = flightByOrigin.get(origin);
      if (!flight) continue;
      legs.push({
        type: "flight",
        travelerId: t.id,
        origin,
        dest: destCode,
        depart: flight.departTime,
        arrive: flight.arriveTime,
        carrier: flight.carrier,
        price: flight.price,
        status: "proposed",
      });
      setFlightMeta(t.id, {
        flightNumber: flight.flightNumber,
        bookingClass: flight.bookingClass,
        origin,
        dest: destCode,
        departureDate: checkIn,
        departureTime: flight.departTime.split("T")[1],
      });
    }

    const hotel = await searchHotelsAt(session, destCode, checkIn, checkOut);
    trace(
      "sabre",
      "shopHotels",
      hotel ? `${destCode} · ${hotel.name} · $${hotel.nightlyRate}/night` : `${destCode} · no hotels found`,
      !!hotel
    );
    if (hotel) {
      setHotelMeta({ hotelCode: hotel.hotelCode, checkIn, checkOut });
      legs.push({
        type: "hotel",
        name: hotel.name,
        checkIn,
        checkOut,
        rooms,
        price: moneyRound(hotel.nightlyRate * nights * rooms),
        status: "proposed",
      });
    }

    updateTrip({ legs });

    return NextResponse.json({
      ok: true,
      legCount: legs.length,
      dest: destCode,
      dateRange: [checkIn, checkOut],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sabre shop failed";
    trace("sabre", "shopFlights", message.slice(0, 160), false);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
