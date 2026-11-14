# Functional checklist (F-01..F-06 + A-02)

- [ ] F-01 Select every site from globe AND drawer; hover labels; far-side markers dim and
      don't respond; context sites say "no analysis" and never show computed values.
- [ ] F-02 Popup -> View more -> close -> reselect: fresh values, focus returns sanely.
- [ ] F-03 Time: Live ticks; Set date/time accepts ISO UTC, rejects nonsense with a message,
      clamps out-of-window with the window named; ±1h/±1d; scrubber drag ≥10 updates/s;
      ←/→ and Shift+←/→ work outside inputs.
- [ ] F-04 Compare: add both sites, shared-time updates, remove works by mouse + keyboard.
- [ ] F-05 Error states: block one site JSON (DevTools request blocking) -> per-site retry
      card, rest alive; WebGL off (browser flag) -> list+map fallback.
- [ ] F-06 Core app complete with assistant closed / no key / offline (preview build).
- [ ] A-02 Full keyboard-only journey: drawer -> select -> detail -> time -> compare ->
      assistant -> About; visible focus throughout; Esc layering correct.
