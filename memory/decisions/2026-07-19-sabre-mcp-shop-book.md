# 2026-07-19 — Real Sabre shop/book via MCP, not REST; hotel books reliably, flight is flaky

## Decision

`backend/sabre/shop.ts` and `book.ts` call Sabre's cert MCP server
(`mcp2.cert.sabre.com`, JSON-RPC via `backend/sabre/mcpClient.ts`) instead of the REST API.
The hackathon token authenticates against MCP but was rejected on every REST endpoint we
tried (`ERR.2SG.SEC.INVALID_CREDENTIALS`) — MCP and REST appear to be separate auth gateways
for this token/PCC. `book.ts` books flights and the hotel as two independent
`create-booking` calls (Sabre's booking is atomic per call) so one side failing doesn't
sink the other.

## Context (10 lines max)

- Real, live-tested: flight search (`search-flights`) and hotel search+book chain
  (`search-hotels` → `get-hotel-rates` → `check-hotel-price` → `create-booking`) all work.
  Hotel booking is **reliable** — confirmed with multiple real confirmation IDs.
- Flight `create-booking` succeeded exactly once (PNR `RVUJVC`) out of ~9 attempts; every
  other attempt fails with a generic `UNABLE_TO_BOOK_FLIGHTS` / "General problem with
  OTA_AirBookLLSRQ service" — looks like flakiness in Sabre's own cert booking backend, not
  a payload bug (same code produced a real PNR once). Don't sink more time chasing this;
  it's outside our control.
- Hotel bookings reject `CASH` (`payment.formsOfPayment[].type` must be `PAYMENTCARD`) —
  uses a generic test Visa (`4111111111111111`, safe/non-sensitive, cert never charges it)
  via `SABRE_TEST_CARD_*` env vars. Flights accept `CASH`, no card needed.
- `hotel.paymentPolicy` must be `"DEPOSIT"` when the rate's `guarantee.guaranteeType` is
  `"DEP"` (else `UNABLE_TO_BOOK_HOTEL_WRONG_PAYMENT_POLICY`) — read this off
  `check-hotel-price`'s `priceCheckInfo.hotelRateInfo.rooms[0].ratePlans[0].rateInfo.guarantee`.
- The priced `bookingKey` is occupancy-locked — putting more travelers in a room than the
  rate was priced for throws `UNABLE_TO_BOOK_HOTEL_OCCUPANCY_MISMATCH`. We book one room at
  the priced occupancy rather than re-running the rate chain per room.
- `flightDetails.flights[]` must list each physical segment once — shop.ts creates one Leg
  per traveler even when they share an origin (for per-traveler UI cards); book.ts dedupes
  by carrier+flightNumber+route+date before sending, or Sabre rejects it as
  `UNABLE_TO_BOOK_FLIGHTS_DUPLICATE_SEGMENT`.
- `flightDetails.flightPricing` needs `[{}]`, not `[]` (schema requires ≥1 item; empty
  object is the documented minimal value for a plain stored-fare booking).

## Rejected alternatives

- **REST API** (`api.platform.sabre.com`): correct hostname found after the `api.test.sabre.com`
  dead-end, but the hackathon token/PCC was rejected on every REST endpoint tested. Abandoned
  in favor of MCP once a teammate confirmed MCP connectivity worked with the same token.
- **Multi-room hotel booking**: would need a separate `get-hotel-rates`/`check-hotel-price`
  call per room to get an occupancy-correct `bookingKey` per room. Skipped for demo scope —
  one room at the priced occupancy is enough to prove the booking chain works end-to-end.

## Revisit when

Someone has more Sabre cert time to spend and wants true multi-room hotel bookings, or wants
to chase why flight `create-booking` fails ~90% of the time in cert (may be worth asking
Sabre support directly rather than guessing further).
