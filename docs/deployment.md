# Deployment guide

The app is a static Vite build. No environment variables, no serverless functions,
no database, no secrets. Anyone with the repository can deploy it.

## 1. Upload to GitHub (team member with an account)
1. Create a new **empty** repository on github.com (no README/licence - the project has them),
   e.g. `vni-moon-navigator`.
2. In a terminal:
   ```
   cd "D:\NASA SPACE APP CHALLENGES\VNI_MoonNavigator"
   git init
   git add .
   git commit -m "VNI Moon Navigator - Space Apps 2026 submission build"
   git branch -M main
   git remote add origin https://github.com/<account>/vni-moon-navigator.git
   git push -u origin main
   ```
3. Verify on GitHub that `node_modules/`, `dist/`, `data-raw/dem-cache/` and any `.env`
   are **absent** (the `.gitignore` excludes them) and that `package-lock.json` is present.
   Size note: the repo carries ~6 MB of committed data/textures/raw responses - fine for GitHub.

## 2. Deploy on Vercel (free tier)
1. vercel.com → **Add New → Project → Import Git Repository** → pick the repo.
2. Settings (Vercel detects Vite automatically - just confirm):
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: (default) `npm install`
   - Root Directory: `./`
   - Node.js Version: 22.x (matches `engines`/`.nvmrc`)
   - Environment variables: **none**
3. Deploy, then check on the live URL:
   - the globe loads and a site click shows real numbers;
   - DevTools → Network: no requests to pgda.gsfc.nasa.gov or ssd.jpl.nasa.gov
     (everything is served from the deployment);
   - the response headers include the CSP from `vercel.json`
     (`connect-src 'self'` plus the five AI provider hosts listed in `src/services/ai/providers.ts`) - then re-test the assistant with a key,
     since CSP only applies on the deployed site, not `vite preview`.
4. The build must not be marked done until someone opens the URL from a second device/network
   (delivery review, `qa/checklists/delivery.md`).

## 3. Local demo fallback (no accounts / no internet at the venue)
Prepare the night before on the demo laptop (install Node.js 22 LTS from nodejs.org):
```
cd VNI_MoonNavigator
npm ci
npm run build
npm run preview
```
Open the printed URL (default http://localhost:4173). The core app then works fully
offline; the assistant additionally needs internet + a key. If everything fails, use
`qa/demo-backup/` (video + screenshots).

## 4. Regenerating data (optional; not needed to deploy)
`npm run data:all` re-runs DEM download (~410 MB into the gitignored cache), horizon masks,
Horizons fetches, derivation and validation; `npm run texture` rebuilds the textures;
`npm test` runs the unit suite. Committed outputs under `public/data/` make this optional.
