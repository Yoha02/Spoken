# Strategy

> Last updated: 2026-07-18 08:25 PT. Long-term rarely changes; short-term is today's plan.

## Long term (the pitch)

Spoken / Swarm Mode: voice is not the interface to a travel agent — it's the control plane
connecting travelers, approvers, AI agents, and providers. The app doesn't wait to be operated:
it reaches people, forms a consent quorum, transacts through Sabre, and keeps operating the trip
after booking (disruption → autonomous provider negotiation). Human-in-the-loop only at payment.

Sponsor scorecard: Vocal Bridge = outbound swarm + provider calls; Sabre = real inventory and
the disruption signal; LandingAI = grounded email extraction; PayPal = the explicit transaction
boundary. Sabre + Vocal Bridge usage is the minimum qualifying criterion for prizes.

Fuller narrative documents live in `bob-analysis/` (local, from 7/17 planning) — treat them as
inspiration, not spec. The shipped scope is this file + README.

## Short term (today — video by 3:00 PM PT)

Four clips, ~3 min total:

1. **Email → Dashboard (30s)** — CEO email arrives, LandingAI extracts travelers/dest/dates/budget,
   dashboard auto-populates. (Gmail add-on one-click if ngrok is up, else paste-text path.)
2. **Vocal Bridge calls the team (1 min)** — outbound calls to Eyoha + Nikhil, preferences
   (origin/seat/diet) land on the dashboard live from the calls.
3. **Confirm & pay (30s)** — Sabre-shopped flights + hotel appear, approve → PayPal split requests.
4. **Flight delay → self-heal (1 min)** — delay flags, board goes DISRUPTED, agent rebooks and
   calls the provider, board settles green, travelers notified.

Recording starts ~8:30-9:00 AM. Anything that can't run live gets captured with dashboard
preview mode (clearly simulated) and swapped later if time allows.
