# AI safety & key-handling checklist

Integrity (each release):
- [ ] Number guard on: every answer shows the match footer; flags render visibly.
- [ ] 10-question eval re-run after any change to tools/prompt (`qa/reports/ai-eval.md`).
- [ ] System prompt still forbids safe/optimal/approved/guaranteed/best and requires the
      geometric qualification; copy audit grep passes (see validate notes).
- [ ] Tools remain read-only and only wrap `src/services/science` + static data.

Key handling (each release, on the deployed URL):
- [ ] Key only ever in `keyStore` memory; no storage/cookies/IndexedDB entries after use.
- [ ] Network tab: key header only on api.anthropic.com; no other third-party requests.
- [ ] 401 clears the key and explains; reload clears the key; Forget key works.
- [ ] CSP `connect-src 'self' https://api.anthropic.com` live.
- [ ] Repo secret scan clean.
