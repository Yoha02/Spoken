# Corporate billing total: booked expenses win, budget is only an estimate

**Date:** 2026-07-18 ~13:00 PT · **By:** Yoha + Yoha's Cursor agent

## Decision

The corporate PayPal charge is the **actual booked total** (sum of priced legs, or
`totalCost`). `budgetPerPerson × headcount` is used **only** as a pre-booking estimate
when nothing is booked yet. The per-traveler split rows are display-only shares of the
one corporate order.

## Why

Commit `09fc908` ("Use one PayPal group total...") computed the billable total as
`Math.max(fromLegs, fromCost, fromBudget, hint)`. With our preview run (booked total
$2,429, budget $1,200 × 3 = $3,600) the budget would win and HR would authorize $3,600
for a $2,429 trip. A budget is a cap, not the charge.

We kept everything else from that commit: single group order, `returnBase` handling,
order reuse on re-authorize, the `TripConfirmation` end screen, and the per-person
guards (a stored per-person figure that exactly matches budget or legs ÷ n is scaled
up to the group total).

## Rejected alternative

Charging `max(booked, budget)` — always overcharges whenever the swarm books under
budget, which is the demo's whole selling point.

## Where

`backend/paypal/split.ts` (`resolveBillableTotal`), mirrored in
`ui/dashboard/Dashboard.tsx` and `ui/components/PaymentGate.tsx` client-side hints.
Verified E2E in sandbox: one order `$2,429`, 3 equal shares, reuse works.
