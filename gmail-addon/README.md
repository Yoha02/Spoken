# Swarm Mode — Gmail add-on

One-click **Start travel swarm** inside Gmail (HR account).  
Opens the CEO travel email → side panel → button → your Swarm app runs Landing AI → employee phones → Vocal Bridge.

## Prerequisites

1. Swarm app running (`npm run dev`).
2. **Public HTTPS URL** to that app (Google cannot call `localhost`):
   - [ngrok](https://ngrok.com/): `ngrok http 3000`
   - or Cloudflare Tunnel, or a deployed host
3. In project `.env.local`:

```env
GMAIL_TRIGGER_SECRET=your-long-random-secret
APP_URL=https://YOUR-PUBLIC-HOST
```

`GMAIL_TRIGGER_SECRET` must match the add-on Script Property `SWARM_SECRET`.

## Install (HR account, test deploy)

1. Go to [script.google.com](https://script.google.com) → **New project**.
2. Rename project to `Swarm Mode Gmail`.
3. Replace `Code.gs` contents with [Code.gs](./Code.gs).
4. **Project Settings** (gear) → check **Show "appsscript.json" manifest**.
5. Open `appsscript.json` and paste [appsscript.json](./appsscript.json).
6. **Project Settings → Script properties** → Add:
   | Property | Value |
   |---|---|
   | `SWARM_API_URL` | `https://YOUR-PUBLIC-HOST` (no trailing slash) |
   | `SWARM_SECRET` | same as `GMAIL_TRIGGER_SECRET` |
7. **Deploy → Test deployments → Install** (or **Manage deployments** → Editor → Install add-on).
8. Open [mail.google.com](https://mail.google.com) as HR → open a CEO travel email → open the add-on panel (**Swarm Mode**) → **Start travel swarm**.

First run will ask for Gmail + external request permissions; accept.

## Demo email (subject can include “travel” or “trip”)

```
Subject: Travel needed — Q3 Austin offsite

Please arrange travel for Ravi.
Destination: Austin
Dates: 2026-08-12 to 2026-08-15
Budget ~$800 per person.
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Unauthorized (401) | `SWARM_SECRET` ≠ `GMAIL_TRIGGER_SECRET` |
| Network / failed fetch | App not public; update `SWARM_API_URL` after ngrok restarts |
| 503 secret not configured | Set `GMAIL_TRIGGER_SECRET` and restart Next.js |
| No travelers | Names must match directory (Ravi, Aashna, Nikhil, Eyoha) |
| No phone call | `VOCALBRIDGE_API_KEY` + `EMPLOYEE_PHONE_*` |

## Security

- Do not commit real secrets.
- Rotate `GMAIL_TRIGGER_SECRET` if the public URL is shared widely.
- The add-on only posts when HR clicks the button on an open message.
