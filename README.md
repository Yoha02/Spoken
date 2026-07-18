# Swarm Mode

Voice-AI travel hackathon demo. A trip-planning email kicks things off, four
simultaneous voice calls fill in the details, and it all plays out live on an
organizer panel and a big-screen "canvas" view for the room.

## The flow

1. **CEO emails HR (Gmail).** The CEO sends a travel request naming the
   employees who need to go (e.g. three names), plus destination / dates /
   budget. That lands in the **HR** Gmail inbox wired up via
   `GMAIL_*` env vars.
2. **HR invokes Landing AI.** On the organizer panel, HR hits
   **Import latest email**. The app fetches the message
   ([backend/intake/gmail.ts](backend/intake/gmail.ts)) and runs Landing AI
   document extraction ([backend/intake/landingai.ts](backend/intake/landingai.ts))
   to pull out `travelerNames`, `dest`, `dateRange`, and `budgetPerPerson`.
   No Gmail yet? Paste the CEO email text and hit **Extract** — same pipeline
   via `/api/extract`.
3. **Landing AI → Vocal Bridge tool.** Extraction results are mapped to phones
   via the employee directory
   ([backend/intake/employeeDirectory.ts](backend/intake/employeeDirectory.ts)),
   then the tool `start_vocal_bridge_swarm`
   ([agent/tools/startVocalBridgeSwarm.ts](agent/tools/startVocalBridgeSwarm.ts))
   places outbound Vocal Bridge calls to those employees to collect origin
   airport, seat preference, and diet. Import auto-starts the swarm; **Start
   swarm** re-runs it. Transcripts land on `traveler.transcript`.
4. **Sabre shops and books** flights/hotels against what the calls learned.
5. **PayPal splits the final cost** across travelers.
6. All of it — call status, transcripts, itinerary, tool trace — streams live
   to both the organizer panel and the canvas via Server-Sent Events.

## Folder structure

The codebase is split into four top-level domains so four people can work at
once without stepping on each other's files:

```
core/       shared contract — TripObject store + SSE plumbing. Nobody "owns"
            this; touch it only with the team's sign-off, since every other
            domain depends on its shape staying stable.
agent/      voice/VocalBridge teammate. Orchestrates the outbound calls.
backend/    integrations, one subfolder per vendor:
              backend/sabre/    — flight/hotel shopping + booking
              backend/paypal/   — split-payment requests
              backend/intake/   — Gmail + LandingAI (already implemented)
ui/         frontend teammate. Dashboard, canvas, shared components, hooks.
app/        Next.js routing shell ONLY — thin, you shouldn't need to touch
            these files after initial setup.
```

`app/api/**/route.ts` files are one-liners that just re-export a handler
from the owning domain, e.g.:

```ts
// app/api/sabre/shop/route.ts
import { shopSabre } from "@/backend/sabre/shop";
export const POST = shopSabre;
```

Next.js requires route handlers to physically live under `app/api/`, so
this file has to exist — but the actual logic you're implementing lives in
`backend/sabre/shop.ts`. Same pattern for `app/page.tsx` /
`app/canvas/page.tsx`, which just re-export `ui/dashboard/Dashboard.tsx` and
`ui/canvas/Canvas.tsx`. In practice: **find your work in `agent/`,
`backend/<vendor>/`, or `ui/` — you should almost never need to edit
anything inside `app/`.**

## Who owns what

| Domain | Files | Status |
|---|---|---|
| `agent/` | `vocalbridge/client.ts`, `tools/startVocalBridgeSwarm.ts`, `voiceToken.ts`, `orchestrator.ts` | Implemented (needs `VOCALBRIDGE_API_KEY`) |
| `backend/sabre/` | `auth.ts` (token, implemented), `shop.ts`, `book.ts` | Auth done, shop/book stubbed (501) |
| `backend/paypal/` | `auth.ts`, `split.ts` (Checkout orders per traveler) | Implemented (sandbox `PAYPAL_*`) |
| `backend/intake/` | `gmail.ts`, `landingai.ts`, `employeeDirectory.ts`, `applyExtraction.ts`, `extract.ts`, `importEmail.ts` | Implemented |
| `ui/` | `dashboard/`, `canvas/`, `components/`, `hooks/`, `lib/` | Implemented |

Pick your domain, implement it, and call into `core/tripObject.ts` to update
state (`getTrip()`, `updateTrip()`, `appendTranscript()`, `appendTrace()`).
Since each domain is its own folder, you shouldn't hit merge conflicts —
just don't edit `core/tripObject.ts`'s type shape without telling the team,
since every domain depends on it. `backend/intake/landingai.ts`'s LandingAI
call and `backend/sabre/auth.ts`'s auth call are both best-effort (verify
endpoint/payload shapes against current docs before the demo — neither
vendor's exact request contract was fully nailed down when these were
written). `landingai.ts` falls back to a rough regex extraction if the API
call fails so a live demo doesn't stall on it; `sabre/auth.ts` doesn't (a
flight search can't be faked), so if `/api/sabre/token` reports failure,
that's your signal to check the request shape.

## Architecture

Everything hangs off a single in-memory `TripObject` ([core/tripObject.ts](core/tripObject.ts)) —
there's no database. Any route handler reads/writes it via `getTrip()`,
`updateTrip()`, `appendTranscript()`, and `appendTrace()`. Every mutation
notifies subscribers, which [core/stream.ts](core/stream.ts) (wired up at
`app/api/stream/route.ts`) turns into a Server-Sent Events feed. Both pages
(`/` and `/canvas`) just subscribe to that stream — no polling, no
client-side state to reconcile.

Because the store is in-memory, it resets on every `next dev` reload of the
server process (not on hot-reload of your edits — it's stashed on
`globalThis` to survive that) and does not persist across `next build`/`next
start` restarts or multiple server instances. That's intentional for a demo;
don't reach for this pattern in production.

## Run it

```bash
npm install
cp .env.local.example .env.local   # fill in real keys
npm run dev
```

- Organizer panel: [http://localhost:3000](http://localhost:3000)
- Big-screen canvas: [http://localhost:3000/canvas](http://localhost:3000/canvas)

All secrets in `.env.local` are read server-side only, inside route
handlers. Never prefix them with `NEXT_PUBLIC_` and never import them into a
client component.

## Gmail setup (for "Import latest email")

The Gmail API itself is free — no billing, a daily quota far beyond what a
demo needs. The only work is a one-time OAuth setup so the app can read your
inbox without a live consent screen during the demo:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project and enable the **Gmail API**.
2. Under **OAuth consent screen**, choose **External**, leave it in
   **Testing** mode, and add your own Gmail address as a test user. (Testing
   mode skips Google's app-verification review — fine for a demo, since only
   test users you list can use it.)
3. Under **Credentials**, create an **OAuth client ID** (type: Desktop app).
   Note the client ID and secret.
4. Get a refresh token once via the
   [OAuth 2.0 Playground](https://developers.google.com/oauthplayground):
   - Gear icon → check "Use your own OAuth credentials" → paste your client
     ID/secret.
   - Step 1: authorize scope `https://www.googleapis.com/auth/gmail.readonly`.
   - Step 2: click "Exchange authorization code for tokens" → copy the
     refresh token.
5. Put all three in `.env.local`: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
   `GMAIL_REFRESH_TOKEN`.

By default the app looks for recent mail with "travel" or "trip" in the subject
(`GMAIL_QUERY` in `.env.local.example` — override it to match the CEO subject
line you'll actually use). Use the **HR** account for OAuth so CEO → HR mail
is readable.

### Example CEO → HR email

```
Subject: Travel needed — Q3 Austin offsite

Hi HR,

Please arrange travel for the following three employees:
1. Ravi
2. Aashna
3. Nikhil

Destination: Austin
Dates: 2026-08-12 to 2026-08-15
Budget ~$800 per person.

Thanks,
CEO
```

Landing AI extracts the three names; the directory maps them to E.164 phones
(`EMPLOYEE_PHONE_*` in `.env.local`); Vocal Bridge dials them.

## Trigger from Gmail (no portal click)

HR can start the same pipeline **from Gmail** with a one-click add-on:

1. Set `GMAIL_TRIGGER_SECRET` and a public `APP_URL` (ngrok/tunnel to this app).
2. Install the Apps Script add-on in [gmail-addon/](gmail-addon/) on the **HR** account
   (Script Properties: `SWARM_API_URL` = public URL, `SWARM_SECRET` = same secret).
3. Open the CEO email → **Swarm Mode** side panel → **Start travel swarm**.

That calls `POST /api/gmail/trigger` with the open message’s subject/body and runs
Landing AI → employee directory → Vocal Bridge. Live view remains at `/canvas`.

Full install steps: [gmail-addon/README.md](gmail-addon/README.md).

## Vocal Bridge setup (outbound swarm)

1. Create an agent at [vocalbridgeai.com](https://vocalbridgeai.com) and enable
   **outbound calling** (paid/pilot; accept outbound ToS in the dashboard or via
   `vb config set --outbound-enabled true --accept-outbound-tos`).
2. Put the agent API key in `.env.local` as `VOCALBRIDGE_API_KEY` (or
   `VOCAL_BRIDGE_API_KEY`). If you use an account-scoped key, also set
   `VOCALBRIDGE_AGENT_ID`.
3. Set real demo phones on the employee directory env vars (or edit
   `backend/intake/employeeDirectory.ts`).
4. Optional: mint a web token via `POST /api/voice-token` for in-browser voice.

## Sabre setup (for flight/hotel shopping)

Sabre's stateless REST APIs authenticate via a sessionless token (valid 7
days, no session/inactivity limits — a good fit since our API routes are
stateless). There are two versions; [backend/sabre/auth.ts](backend/sabre/auth.ts)
defaults to **v2** because it's EPR-only and needs no Client ID/Secret — the
right fit for Developer Hub / DEVCENTER test credentials:

- `SABRE_EPR_USERNAME` (format `V1:<userid>:<PCC>:<domain>`) /
  `SABRE_EPR_PASSWORD` — your EPR login.

Set `SABRE_TOKEN_VERSION=v3` instead if you have a Client ID/Secret from
your account manager and want calls scoped to that application — v3 also
needs `SABRE_CLIENT_ID` / `SABRE_CLIENT_SECRET`, with the EPR credentials
still required (they go in the request body instead of the header).

Sabre's Authorization header isn't a plain `base64(user:pass)` — it
base64-encodes the username and password **separately**, joins them with
`:`, then base64-encodes that combined string again. `backend/sabre/auth.ts`
handles this for you; it's called out here because it's easy to get wrong
if you ever touch that code.

Don't have your own PCC/EPR yet? Sabre Developer Hub's "Get a Token" guide
points to a shared **DEVCENTER** test username/password for trying PCC-gated
APIs in the test environment — grab it from your Developer Hub account
rather than hardcoding one here, since it's the kind of thing that can
rotate. For your own PCC/EPR/Client ID/Secret, contact a Sabre Account
Manager or use [Sabre's Contact Us](https://www.sabre.com/contact-us/) page.

Once set, put the values in `.env.local` along with `SABRE_BASE_URL`
(defaults to `https://api.test.sabre.com`), start the dev server, and hit
`GET /api/sabre/token` — it returns `{ ok: true }` if auth succeeds, or
`{ ok: false, error }` if something's wrong with the credentials or request
shape.

## ngrok (for inbound voice webhooks)

VocalBridge (and anything else that needs to call back into this app —
webhooks, callbacks) needs a public URL. Point ngrok at your local dev
server:

```bash
ngrok http 3000
```

Use the resulting `https://*.ngrok-free.app` (or reserved domain) URL
wherever the provider dashboard asks for a webhook/callback URL, and as the
base URL your agent code uses to reach `/api/*` routes if it's calling back
from an external service. Restart ngrok and update the dashboard config if
the URL changes between sessions (free tier URLs aren't stable).

## Demo travelers

The store seeds 4 travelers (`ravi`, `aashna`, `nikhil`, `eyoha`) with
placeholder E.164 phone numbers — replace them in
[core/tripObject.ts](core/tripObject.ts)'s `seedTrip()` before the real demo.
The destination, dates, and budget start blank and are filled in by the
email import step above.
