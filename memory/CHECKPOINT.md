# Checkpoint

> Overwrite this file in place. A task is not done until this file reflects it.
> Last updated: 2026-07-18 13:45 PT by Yoha's Cursor agent

## Where we are

- Deadline: **demo video submitted by 3:00 PM PT today** (~3 min, 4 clips — see `memory/strategy.md`).
- **LIVE ON CLOUD RUN: <https://spoken-287927050303.us-west1.run.app>** (project `spoken-502815`,
  region us-west1, service `spoken`, single instance min=max=1, 3600s timeout for SSE).
  Deployed from `main` @ `32f1d19`. Redeploy: `gcloud run deploy spoken --source . --region us-west1`.
- Smoke-tested live: dashboard + canvas 200; `POST /api/gmail/trigger` returns 200 with
  **`source: "landingai"` (real LandingAI extraction working)**; travelers resolve; VB env vars set.
- Env vars are set on the Cloud Run service (VB keys, phones, LandingAI key, trigger secret,
  APP_URL). Sabre + PayPal env vars NOT set yet — creds still missing.
- Full app skeleton is merged to `main`: intake (Gmail + LandingAI), Vocal Bridge
  outbound swarm with transcript polling, PayPal sandbox split + capture, SSE dashboard + canvas UI.
- **Preview mode is the recording path** (`VOCALBRIDGE_CALLS_ENABLED=false`, the default):
  paced server-side timeline — staggered calls with highlight lines (matched to the real
  VB agent prompts: Nikhil SJC→SFO/window/Fremont Uber, Eyoha SFO/aisle/vegetarian) →
  staged Sabre flight+hotel search → legs land one by one → booked with group PNR →
  payment gate → real PayPal capture → "Trip confirmed" end screen. Only UI tell is a
  small "Preview" chip in the top bar; no "test/simulated/demo" wording anywhere.
  `PREVIEW_FAST=true` env collapses pacing for iteration.
- **Demo controls (recording flow)**: **Extract = reset** (wipes feed/legs/payment/call
  state via new `POST /api/reset`; with pasted text it re-extracts trip details but does
  NOT auto-call) → **Start swarm = launch**. "Import latest email" still auto-swarms
  (Gmail add-on path). Calls are paced ~30–40s each (connect → relay highlights → close),
  verified: Nikhil 31s, Ravi 31s, Eyoha 38s. Action feed now mirrors every center-stage
  event (fare/hotel holds, Uber quote, restaurant call, bookings, priced total). A run
  generation counter aborts any in-flight preview timeline when a new run starts — no
  ghost writes on re-trigger. Bottom `RunTimeline` nav (Intake → Calls → Booking →
  Verification → Confirmed, sponsor-labeled) is clickable for recap views.
- `.env.local` exists locally on Yoha's machine (VB keys, phones, LandingAI key, trigger secret).
  Not committed (correct). Cloud Run env file at `tmp/cloudrun-env.yaml` (gitignored).

## Status by domain

| Domain | Status |
|---|---|
| `core/` state + SSE | Done |
| `backend/intake/` Gmail + LandingAI | Done (LandingAI key still missing → regex fallback fires) |
| `agent/` VB swarm calls | Done; agents need outbound + interview prompt configured in VB dashboard |
| `backend/paypal/` corporate checkout | Done — **corporate account model**: gate is HR "Verify trip expenses" (per-traveler breakdown + total, X to dismiss, "Authorize payment"), creates ONE PayPal order for the full booked total; capture marks everything paid → TripConfirmation cards. **Billing rule (decided 07-18 13:00): booked expenses (legs/totalCost) are the charge; budgetPerPerson × headcount is only a pre-booking estimate fallback — budget is a cap, never overrides booked totals.** Verified E2E in sandbox: $2,429 booked total → one order, 3 equal display shares, order reuse on re-authorize works. Still needed: sandbox buyer login to complete checkout on camera; add creds to Cloud Run env on next deploy. Confirmation emails after payment = Ravi. |
| `backend/sabre/` auth | Done (needs EPR creds to verify via GET /api/sabre/token) |
| `backend/sabre/` shop + book | **Stubbed 501 — critical path, in progress (see Claims)** |
| Disruption → self-heal (clip 4) | **Done — Trip Guardian**: 6th timeline stage (clickable after payment) arms `POST /api/guardian` → paced tracking view: Uber pickups + departure on time → mid-flight wildfire-smoke delay (+1h05m, dot flips red, flight ETAs update to 3:40 PM) → self-heal (Uber rescheduled, VB call to Kimber Modern, Sabre booking modified at **$0 change · no approval needed**) → SMS to travelers → dot back green + "continuing to monitor" close (~47s total). Verified E2E locally. |
| `ui/` dashboard + canvas | Done (server preview timeline covers clips 1–3; local phase-preview strip removed) |

## Claims (who is doing what right now)

| Who | Task | Since |
|---|---|---|
| Ravi | Connect Gmail add-on to live Cloud Run URL, validate LandingAI end-to-end | 07-18 09:20 |
| Yoha's Cursor agent | Trip Guardian shipped; next: Cloud Run redeploy for recording | 07-18 13:45 |
| Nikhil | Recording his call clip at the gym; VB agent outbound config | 07-18 morning |

## Next steps (ordered)

1. Ravi: set Apps Script Script Properties (`SWARM_API_URL` = Cloud Run URL, `SWARM_SECRET` =
   trigger secret from Yoha) → click "Start travel swarm" on the CEO email → verify dashboard.
2. Sabre shop → writes flight legs + totalCost; book → flips legs to booked (unlocks payment gate).
3. ~~Disrupt/self-heal routes~~ DONE — Trip Guardian (clip 4 recordable end-to-end).
4. Configure both VB agents with the interview prompt, outbound enabled, one test call.
5. Record clips (order: 2 → 1 → 3 → 4); dashboard preview mode is the fallback for any clip.
6. After any code change that a clip depends on: redeploy to Cloud Run and note the SHA here.
   **Pending: Cloud Run is still on `32f1d19` — redeploy needed to pick up preview pacing,
   Extract-reset, and corporate PayPal changes before recording from the hosted URL.**

## Blocked on humans

- **Sabre EPR credentials** (`SABRE_EPR_USERNAME` in `V1:<userid>:<PCC>:<domain>` format + password) — #1 blocker, from Developer Hub.
- ~~PayPal sandbox CLIENT_ID/SECRET~~ RESOLVED — in Yoha's `.env.local`, order creation verified. Still need a **sandbox buyer login** to complete checkout on camera (or pay-by-card in sandbox).
- Video editing volunteer for the final cut.
- ~~LandingAI key~~ RESOLVED — live and verified on Cloud Run.
- Gmail OAuth trio — NOT needed for the add-on path; skip unless we want the dashboard "Import latest email" button.
