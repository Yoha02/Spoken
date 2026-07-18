# Checkpoint

> Overwrite this file in place. A task is not done until this file reflects it.
> Last updated: 2026-07-18 09:20 PT by Yoha's Cursor agent

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
  outbound swarm with transcript polling, PayPal sandbox split, SSE dashboard + canvas UI.
- `.env.local` exists locally on Yoha's machine (VB keys, phones, LandingAI key, trigger secret).
  Not committed (correct). Cloud Run env file at `tmp/cloudrun-env.yaml` (gitignored).

## Status by domain

| Domain | Status |
|---|---|
| `core/` state + SSE | Done |
| `backend/intake/` Gmail + LandingAI | Done (LandingAI key still missing → regex fallback fires) |
| `agent/` VB swarm calls | Done; agents need outbound + interview prompt configured in VB dashboard |
| `backend/paypal/` split orders | Done (needs sandbox CLIENT_ID/SECRET; no capture step — status stays "requested") |
| `backend/sabre/` auth | Done (needs EPR creds to verify via GET /api/sabre/token) |
| `backend/sabre/` shop + book | **Stubbed 501 — critical path, in progress (see Claims)** |
| Disruption → self-heal (clip 4) | **Not built — in progress (see Claims)** |
| `ui/` dashboard + canvas | Done (preview mode can simulate all phases as fallback) |

## Claims (who is doing what right now)

| Who | Task | Since |
|---|---|---|
| Ravi | Connect Gmail add-on to live Cloud Run URL, validate LandingAI end-to-end | 07-18 09:20 |
| Yoha's Cursor agent | Next: Sabre shop/book implementation + disrupt/self-heal demo routes | 07-18 09:20 |
| Nikhil | Recording his call clip at the gym; VB agent outbound config | 07-18 morning |

## Next steps (ordered)

1. Ravi: set Apps Script Script Properties (`SWARM_API_URL` = Cloud Run URL, `SWARM_SECRET` =
   trigger secret from Yoha) → click "Start travel swarm" on the CEO email → verify dashboard.
2. Sabre shop → writes flight legs + totalCost; book → flips legs to booked (unlocks payment gate).
3. Disrupt/self-heal routes → clip 4 recordable (flight delay → rebook → provider call → green).
4. Configure both VB agents with the interview prompt, outbound enabled, one test call.
5. Record clips (order: 2 → 1 → 3 → 4); dashboard preview mode is the fallback for any clip.
6. After any code change that a clip depends on: redeploy to Cloud Run and note the SHA here.

## Blocked on humans

- **Sabre EPR credentials** (`SABRE_EPR_USERNAME` in `V1:<userid>:<PCC>:<domain>` format + password) — #1 blocker, from Developer Hub.
- **PayPal sandbox** `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` (+ sandbox buyer login for on-screen approval).
- Video editing volunteer for the final cut.
- ~~LandingAI key~~ RESOLVED — live and verified on Cloud Run.
- Gmail OAuth trio — NOT needed for the add-on path; skip unless we want the dashboard "Import latest email" button.
