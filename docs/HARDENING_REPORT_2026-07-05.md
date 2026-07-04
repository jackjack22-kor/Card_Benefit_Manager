# Hardening Report - 2026-07-05

## Goal

Apply the next hardening axes after the full audit, then re-check the project from these perspectives:

1. Bugs and regressions.
2. Missing exception handling.
3. Performance issues.
4. Security and privacy risk.
5. Code readability and maintainability.

Four read-only sub-agent audits were used in parallel:

- Bug/regression audit.
- Exception/data preservation/sync audit.
- Performance/mobile UX audit.
- Security/privacy/code-quality audit.

## Implemented Changes

### Sync Safety

- Replaced direct `setDoc` cloud writes with Firestore `runTransaction`.
- Each cloud save now re-reads the latest cloud document, merges if the cloud revision moved, then writes a new revision.
- Added a pending-cloud-save marker in localStorage so failed/unfinished cloud saves can be retried after login/reconnect.
- Wrapped remote-state application with `try/finally` so `savingRemote` cannot remain stuck after local storage or render errors.
- Hardened device ID creation when localStorage is unavailable.

Remaining note:

- This is safer than last-writer-wins, but still not a full field-level CRDT. True concurrent edits to the same nested field can still need product-level conflict handling.

### Formula And Recommendation Safety

- Conditional `reward` benefits now respect previous-month unmet status.
- `전월실적 관계없이` is treated as an exemption, while new-card grace text such as "신규 발급월 포함 3개월은 실적 관계없이" no longer disables the previous-month condition for all future months.
- Explicit zero benefit support is now separated from old/empty zero values:
  - Legacy `benefitValue: 0` keeps automatic calculation.
  - `benefitValue: 0` with `manualBenefitOverride: true` suppresses automatic calculation.
  - Entering a benefit `usedAmount` recalculates and clears manual override.
- Added the missing `travel` category.

### Dashboard UX

- Added quick monthly spend input directly on dashboard cards.
- This writes to the same selected-month card usage field as card detail.
- Reduced duplicate mobile pre-navigation commits by using `pointerdown` when supported and `touchstart` only as a fallback.

### Recommendation Performance

- Payment amount input still updates state immediately.
- Recommendation result rendering is debounced to 180ms and only refreshes the recommendation result region, not the full app.
- `change` still forces immediate recalculation.

### Storage And Import Safety

- localStorage save failures are caught and shown to the user once.
- Corrupt local state is preserved best-effort under a timestamped `.corrupt` key before falling back to a fresh state.
- Backup import now rejects empty JSON payloads.
- Backup import limits files to 1MB and handles FileReader error/abort.
- Imported point value keys are whitelisted.
- Imported selected tab/category, monthly card IDs, monthly spend, and previous-month status are sanitized.

### PWA And Security

- Service worker install no longer swallows precache failure.
- Runtime cache is limited to navigations and expected static assets/images/icons.
- Added `firestore.rules` with owner-only access to `users/{uid}/private/**`.
- Added `docs/FORMULAS.md` documenting benefit types, automatic formulas, manual override policy, and regression coverage.

## Verification

Commands run:

```bash
npm run audit:check
npm run build:pages
git diff --check
```

Results:

- `npm run audit:check`: passed.
- `npm run build:pages`: passed.
- `git diff --check`: passed.
- Expected Vite Firebase bundle size warning remains.

## Sub-Agent Findings Addressed

- P1 reward recommendations ignoring previous-month unmet status: fixed.
- P1/P2 Firebase overwrite and stuck `savingRemote`: mitigated with transactions and `try/finally`.
- P1 recommendation input overwork: reduced via debounce and partial render.
- P1 service worker failed precache deleting old cache risk: fixed by failing install on precache failure.
- P2 localStorage exceptions: caught and surfaced.
- P2 empty/malicious backup import: narrowed with validation and sanitization.
- P2 dashboard input workflow: improved with quick monthly spend editing.
- P3 missing category: fixed with `travel`.

## Remaining Risks

- Full conflict-free sync is not complete. Same-field concurrent edits still need a future conflict UI or per-record metadata.
- `src/main.js` remains large and does too much. A later refactor should split rendering, event handling, backup, and sync UI.
- GitHub Pages cannot enforce strong HTTP CSP headers. A meta CSP can be considered later, but Firebase/Auth domains need careful allowlisting.
- The Firebase bundle still produces a Vite chunk-size warning. Dynamic import for sync code would improve first-load performance.
- Formula accuracy still depends on card data quality. `docs/FORMULAS.md` and `npm run audit:check` should continue growing with each new card/benefit.

