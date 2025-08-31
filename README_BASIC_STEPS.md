# NSW Planning – App Router Starter (API + UI)

This bundle adds:
- `/api/nswPlanningAtPoint` – API route that calls NSW Point API and returns stable JSON.
- `/api/health` and `/api/info` – probes.
- `/results` – a basic UI to display the JSON (tables + ✅/❌).

## Ultra-basic step-by-step (Vercel + GitHub)

1) **Download this ZIP** to your computer.
2) Open your Next.js repo folder.
3) Copy the `app/` folder from the ZIP into your repo (merge directories).
4) Commit & push:
   ```bash
   git add app
   git commit -m "Add NSW Planning API + health/info + basic results UI"
   git push
   ```
5) In **Vercel → Project → Settings → Environment Variables**, add:
   - `POINT_API_KEY = <your NSW Point key>`
   Apply to Production (and Preview if needed), then redeploy.
6) Test in a browser:
   - `/api/health` should return `{ ok: true }`
   - `/api/info` shows env + commit SHA
   - `/api/nswPlanningAtPoint?lat=-33.8688&lon=151.2093` should return JSON
   - `/results` lets you run the query and see a report
7) If you get a 502, the upstream call failed → check `POINT_API_KEY`, and confirm NSW response field paths.

## PowerShell quick tests
```powershell
$base = "https://<your-app>.vercel.app"
Invoke-RestMethod "$base/api/health"
Invoke-RestMethod "$base/api/info"
Invoke-RestMethod "$base/api/nswPlanningAtPoint?lat=-33.8688&lon=151.2093"
```

## Notes
- Keep `export const runtime = 'nodejs'` while debugging to avoid Edge runtime limits.
- Replace placeholder SEPP rules and feasibility when ready.
