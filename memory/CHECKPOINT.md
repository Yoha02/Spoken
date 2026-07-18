# Checkpoint

> Overwrite this file in place. A task is not done until this file reflects it.
> Last updated: 2026-07-18 08:25 PT by Yoha's Cursor agent

## Where we are

- Deadline: **demo video submitted by 3:00 PM PT today** (~3 min, 4 clips — see `memory/strategy.md`).
- Full app skeleton is merged to `main` (`24415d0`): intake (Gmail + LandingAI), Vocal Bridge
  outbound swarm with transcript polling, PayPal sandbox split, SSE dashboard + canvas UI.
- `.env.local` exists locally on Yoha's machine with VB agent keys + phones for
  Nikhil (+13612282790) and Eyoha (+14702264822). Not committed (correct).

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
| Yoha's Cursor agent | Sabre shop/book implementation + disrupt/self-heal demo routes | 07-18 08:25 |
| Nikhil | Recording his call clip at the gym; VB flow updates | 07-18 morning |

## Next steps (ordered)

1. Sabre shop → writes flight legs + totalCost; book → flips legs to booked (unlocks payment gate).
2. Disrupt/self-heal routes → clip 4 recordable (flight delay → rebook → provider call → green).
3. Configure both VB agents with `vocal-bridge-prompts/gym-smartwatch-traveler.txt`, outbound enabled.
4. ngrok + Apps Script `SWARM_API_URL` fix for the one-click Gmail trigger (currently points at test.com).
5. Record clips 1-4; keep dashboard preview mode as the fallback for any clip that fails live.

## Blocked on humans

- **Sabre EPR credentials** (`SABRE_EPR_USERNAME` in `V1:<userid>:<PCC>:<domain>` format + password) — from Developer Hub, event email login.
- **PayPal sandbox** `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` (own app or organizer-provided from Discord).
- **`LANDINGAI_API_KEY`** from ade.landing.ai.
- Gmail OAuth trio (`GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN`) — only if we want real inbox import over paste-text.
- Decision: host on Cloud Run later or stay local+ngrok for the video (warning: in-memory store breaks on serverless/Vercel — see `memory/decisions/2026-07-18-hosting.md`).
