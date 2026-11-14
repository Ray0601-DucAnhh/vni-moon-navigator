# Delivery checklist (final review before submission)

Run top to bottom on submission day; initial and date each line. Nothing ships unchecked.

## Repository
- [ ] Fresh clone on a second machine: `npm ci && npm test && npm run build` all pass.
- [ ] GitHub shows NO `node_modules/`, `dist/`, `.env*`, `data-raw/dem-cache/`.
- [ ] `package-lock.json`, `LICENSE`, `README.md`, `CREDITS.md` present at root.
- [ ] Research workbook untouched (lives outside the repo; repo has no absolute `D:\` paths -
      `grep -r "NASA SPACE APP" src scripts public docs` returns nothing).
- [ ] No secrets: search `sk-ant-api`, `ANTHROPIC_API_KEY=`, `Bearer ` across the repo.

## Deployed URL
- [ ] Opens from a second device + different network; globe interactive ≤ 5 s on a normal laptop.
- [ ] Hard refresh works; no 404s in DevTools.
- [ ] Network tab: only same-origin requests during normal use (no PGDA/Horizons calls).
- [ ] CSP header present; assistant works under it with a real key (then Forget key).
- [ ] Visual pass 2 on this URL at 1440×900 / 1280×720 / 375×812 + one real phone photo ->
      `qa/reports/visual-pass-2.md` (all S1/S2 closed).
- [ ] F-05 error states + full keyboard run recorded in `qa/reports/functional.md`.
- [ ] AI 10-question eval recorded in `qa/reports/ai-eval.md` (or the assistant is
      presented as "implemented, judge-keyed" with the backup video showing it).

## Backup & submission
- [ ] `qa/demo-backup/`: ≤90 s screen recording (≤50 MB) + 6 annotated PNGs; plays offline.
- [ ] Local fallback rehearsed with Wi-Fi off (`npm run preview`).
- [ ] Official submission form fields match `docs/submission/submission-notes.md`;
      challenge-page requirements re-read on submission day.
- [ ] Demo laptop: Node 22 installed, repo cloned, `npm ci` done, browser tab pinned.

Sign-off (all three team members): ______________________  Date/time (ICT): ____________
