# AI key-handling security review (AA-3)

Date: 2026-11-14. Build: dev server + first production build. Reviewer: implementation
session (automated checks via the embedded browser); to be repeated on the deployed URL.

## Design facts (code review)
- The key lives in a module closure (`src/services/ai/keyStore.ts`); it is NOT in React
  state, zustand, localStorage/sessionStorage, IndexedDB, cookies, URLs or any log call.
- Requests go only through the official `@anthropic-ai/sdk` with its explicit browser
  opt-in; there is no VNI server, proxy or analytics anywhere in the app.
- A 401 clears the key immediately and tells the user; "Forget key" and tab close clear it.
- (2026-11-15) The user may also pick Gemini, Groq, OpenRouter or Mistral; those calls use
  plain `fetch` with `Authorization: Bearer <key>` to that host only. Same storage rules.
- `vercel.json` adds a `connect-src` CSP limited to `'self'` and the five provider hosts, so even injected
  script could not exfiltrate to other hosts on the deployed site (defence in depth; must
  be re-verified on the live deployment - CSP does not apply under `vite preview`).
- Answers render as text nodes (no innerHTML), so tool/model output cannot inject markup.

## Checks run (2026-11-14, invalid smoke-test key "sk-ant-invalid-...")
| Check | Result |
|---|---|
| Browser -> api.anthropic.com request fires from the page (CORS + SDK wiring) | PASS - provider returned 401 (console: "Failed to load resource: 401") |
| 401 handling: key removed from memory, user returned to key screen | PASS (after fix: an explanatory notice is shown - re-verify in pass 2) |
| localStorage / sessionStorage / cookies / IndexedDB after set+use+forget | PASS - all empty (`{"localStorage":{},"sessionStorage":{},"cookies":"","indexedDBs":[]}`) |
| Key appears in page URL or document title | PASS - never |
| Repo scan for live-looking secrets (`sk-ant-api`, `ANTHROPIC_API_KEY=` with a value) | PASS - none (the only `sk-ant` strings are the placeholder and the invalid smoke-test value in QA docs) |

## Remaining for the team (deployed URL, with a real key)
1. DevTools Network: the key only in the `x-api-key` header of api.anthropic.com requests;
   no other third-party request appears during a chat.
2. CSP header present on the live site; assistant works under it.
3. Reload clears the key (panel returns to key screen).
Record outcomes here.
