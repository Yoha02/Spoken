# Agent instructions — read this first

Before doing ANY work in this repo:

1. Read `memory/CHECKPOINT.md` — current state, in-flight work, next steps, open questions.
2. Check its **Claims** section so you don't duplicate work someone else has in flight.

Before ending ANY work session:

3. Update `memory/CHECKPOINT.md` (overwrite in place). **A task is not done until this file reflects it.**
4. If you made a non-obvious or contested choice, add an append-only note:
   `memory/decisions/YYYY-MM-DD-<slug>.md` (never edit or delete existing decision files).
5. Don't restate what the git diff already says — record intent, rationale, rejected
   alternatives, and next steps. Trust code and git over memory files if they conflict,
   then fix the memory file.

## Project in one line

Swarm Mode: voice-AI corporate-travel demo for the DeepLearning.AI / Sabre / Vocal Bridge
hackathon (July 18, 2026). CEO email → LandingAI extraction → parallel Vocal Bridge calls
→ Sabre shop/book → PayPal split → live SSE dashboard, with a disruption self-heal beat.

## Hard contracts (do not break without team sign-off)

- `core/tripObject.ts` — the shared TripObject type shape. Every domain depends on it.
- `app/**` stays thin: route files only re-export handlers from `agent/`, `backend/`, `ui/`.
- All secrets are server-side only (`.env.local`, never `NEXT_PUBLIC_`, never in client components).
- Domain ownership: `agent/` (voice), `backend/<vendor>/` (integrations), `ui/` (frontend),
  `core/` (shared state — touch only with team sign-off).

## More context

- `README.md` — full architecture, setup, and vendor how-tos.
- `memory/strategy.md` — demo narrative, video plan, and priorities.
