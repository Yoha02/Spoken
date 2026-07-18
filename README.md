# Swarm Mode

Voice-AI travel hackathon demo. A trip-planning email kicks things off, four
simultaneous voice calls fill in the details, and it all plays out live on an
organizer panel and a big-screen "canvas" view for the room.

## The flow

1. **Email arrives.** One of the group emails the others with a destination,
   dates, and a rough budget. The organizer hits **Import latest email**,
   which fetches it via the Gmail API ([lib/gmail.ts](lib/gmail.ts)) and runs it
   through LandingAI extraction ([lib/landingai.ts](lib/landingai.ts)) to pull out
   `dest`, `dateRange`, and `budgetPerPerson`. No Gmail set up yet, or the
   detail came from a group chat instead? Paste the text into the box below
   the button — it hits the same extraction logic via `/api/extract`.
2. **Organizer clicks "Start swarm."** This calls `/api/agent`, which is meant
   to place outbound voice calls (via VocalBridge) to each of the 4
   travelers to collect their origin airport, seat preference, and dietary
   restriction. Each call's transcript streams into `traveler.transcript`.
3. **Sabre shops and books** flights/hotels against what the calls learned.
4. **PayPal splits the final cost** across travelers.
5. All of it — call status, transcripts, itinerary, tool trace — streams live
   to both the organizer panel and the canvas via Server-Sent Events.

## Architecture

Everything hangs off a single in-memory `TripObject` ([lib/tripObject.ts](lib/tripObject.ts)) —
there's no database. Any route handler reads/writes it via `getTrip()`,
`updateTrip()`, `appendTranscript()`, and `appendTrace()`. Every mutation
notifies subscribers, which [app/api/stream/route.ts](app/api/stream/route.ts)
turns into a Server-Sent Events feed. Both pages (`/` and `/canvas`) just
subscribe to that stream — no polling, no client-side state to reconcile.

Because the store is in-memory, it resets on every `next dev` reload of the
server process (not on hot-reload of your edits — it's stashed on
`globalThis` to survive that) and does not persist across `next build`/`next
start` restarts or multiple server instances. That's intentional for a demo;
don't reach for this pattern in production.

## Who owns what

| Route | Owns | Status |
|---|---|---|
| `app/api/import-email/route.ts` | Fetch latest trip email, run extraction, update trip | Implemented |
| `app/api/extract/route.ts` | Manual text → extraction (email paste or group-chat text) | Implemented |
| `app/api/voice-token/route.ts` | Minting a VocalBridge client token | Stub (501) |
| `app/api/agent/route.ts` | Voice-agent orchestration, "Start swarm" entrypoint | Stub (501) |
| `app/api/sabre/token/route.ts` | Diagnostic — confirms Sabre auth works | Implemented |
| `app/api/sabre/shop/route.ts` | Sabre flight/hotel shopping | Stub (501) |
| `app/api/sabre/book/route.ts` | Sabre booking / PNR creation | Stub (501) |
| `app/api/paypal/split/route.ts` | PayPal split-payment requests | Stub (501) |

Pick a stub, implement it, and call into `lib/tripObject.ts` to update
state. Since everyone's route is a separate file, you shouldn't hit merge
conflicts — just don't edit `lib/tripObject.ts`'s type shape without telling
the team, since it's shared. `lib/landingai.ts`'s LandingAI call and
`lib/sabre.ts`'s auth call are both best-effort (verify endpoint/payload
shapes against current docs before the demo — neither vendor's exact
request contract was fully nailed down when these were written).
`lib/landingai.ts` falls back to a rough regex extraction if the API call
fails so a live demo doesn't stall on it; `lib/sabre.ts` doesn't (a flight
search can't be faked), so if `/api/sabre/token` reports failure, that's
your signal to check the request shape.

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

By default the app looks for an unread email with "trip" in the subject sent
in the last 7 days (`GMAIL_QUERY` in `.env.local.example` — override it to
match whatever subject line you'll actually use).

## Sabre setup (for flight/hotel shopping)

Sabre's stateless REST APIs authenticate via a sessionless token (valid 7
days, no session/inactivity limits — a good fit since our API routes are
stateless). There are two versions; [lib/sabre.ts](lib/sabre.ts) defaults to
**v2** because it's EPR-only and needs no Client ID/Secret — the right fit
for Developer Hub / DEVCENTER test credentials:

- `SABRE_EPR_USERNAME` (format `V1:<userid>:<PCC>:<domain>`) /
  `SABRE_EPR_PASSWORD` — your EPR login.

Set `SABRE_TOKEN_VERSION=v3` instead if you have a Client ID/Secret from
your account manager and want calls scoped to that application — v3 also
needs `SABRE_CLIENT_ID` / `SABRE_CLIENT_SECRET`, with the EPR credentials
still required (they go in the request body instead of the header).

Sabre's Authorization header isn't a plain `base64(user:pass)` — it
base64-encodes the username and password **separately**, joins them with
`:`, then base64-encodes that combined string again. `lib/sabre.ts` handles
this for you; it's called out here because it's easy to get wrong if you
ever touch that code.

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
[lib/tripObject.ts](lib/tripObject.ts)'s `seedTrip()` before the real demo.
The destination, dates, and budget start blank and are filled in by the
email import step above.
