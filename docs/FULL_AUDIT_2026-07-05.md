# Full Audit Report - 2026-07-05

## Executive Summary

CardFit/Card Benefit Manager is now useful as a personal card operations app. It already covers the three jobs that matter most:

1. Check which cards still need monthly spend.
2. Decide which card to use right before payment.
3. Review practical monthly benefit amount and benefit rate.

The current implementation is strong enough for daily personal use, especially for a power user who knows the card pool and wants monthly discipline. The app is not yet a fully reliable multi-user financial product because conflict-safe cloud sync, formula specs, and automated UI tests are still early. The right product status is: **personal-use beta with high practical value, but calculation/sync governance must keep improving.**

## Audit Scope

- Product fit and mobile UX.
- Benefit data, recommendation logic, and monthly practical benefit calculation.
- localStorage, Firebase sync, GitHub Pages/PWA behavior.
- Code quality, testability, and deployment safety.
- Regression checks for the most important user-specific card patterns.

Four parallel read-only sub-agent audits were used:

- Product/UX audit.
- Benefit calculation/data audit.
- Storage/sync/PWA audit.
- Code quality/test/deployment audit.

## Current Product Utility

The app is already meaningfully helpful for the original goal: maximizing value from a fixed owned-card pool. The most valuable shipped pieces are:

- The dashboard separates shortfall cards from managed/met cards and exposes monthly shortfall quickly.
- Card detail keeps monthly spend, annual spend, benefit usage, and benefit history in one place.
- Payment recommendation filters by category/subcategory and explains benefit conditions.
- Firebase Auth + Firestore sync allows Android/iPhone/PC usage while preserving local-only mode.
- Practical benefit rate is now available as a small supporting metric, matching the intended role.

The biggest product gap is speed at the moment of payment. The recommendation screen is accurate and explanatory, but it can still feel heavier than a 5-second checkout decision. A future "quick pay mode" would be the highest-impact UX upgrade.

## Fixes Applied During This Audit

### 1. Payment Recommendation Updates Immediately

Finding: the payment amount input formatted commas on `input`, but recommendation state only changed on `change`. On mobile, a user could type an amount and briefly see stale recommendations.

Fix:

- Split recommendation result rendering into `renderRecommendColumns`.
- Added `updateRecommendationAmount` so only the recommendation result area updates while the input keeps focus.
- Rebound card-open events after partial result refresh.

Files:

- `src/main.js`

### 2. Recommendation Mileage Cap Safety

Finding: recommendation calculation for `reward` benefits ignored `monthlyPointCap`. Example: Samsung THE 1 special SKYPASS miles could be overestimated on large department/hotel/travel payments.

Fix:

- Applied `monthlyPointCap` inside the reward recommendation branch.

Files:

- `src/lib/recommend.js`

### 3. Benefit Home Status Uses Current Month Spend For Cap Display

Finding: benefit status chips could show a cap based only on inferred previous spend, while the new monthly-spend-based auto formulas use current month spend for user-pattern cards.

Fix:

- The benefit home status now uses the larger of inferred previous spend and selected-month spend for cap display.

Files:

- `src/lib/recommend.js`

### 4. Service Worker Avoids Caching Bad Responses

Finding: the service worker cached every fetched response, including temporary 404/500 deployment responses.

Fix:

- Only successful `response.ok` responses are cached.

Files:

- `public/sw.js`

### 5. Repeatable Audit Check Added

Finding: `npm run check` was syntax-only and did not protect benefit formulas.

Fix:

- Added `npm run audit:check`.
- Added `tools/audit-check.mjs` with golden cases for SKT Woori, Woori Point, KB TalkTalk, MG+S, Shinhan Always On, Coupang WOW, Marriott Classic, manual override behavior, shortfall, and THE 1 mileage cap.

Files:

- `package.json`
- `tools/audit-check.mjs`

## Verification

Commands run:

- `npm run audit:check`
- `npm run build:pages`
- `git diff --check`

Results:

- Syntax checks passed.
- Audit formula checks passed.
- GitHub Pages build passed.
- Diff whitespace check passed.
- Expected Vite chunk-size warning remains due Firebase bundle size.
- Non-blocking audit warning: `samsung-the1-skypass:the1-special-mile:travel` references a `travel` category that does not yet exist in `CATEGORIES`.

## Key Remaining Findings

### P1 - Cloud Sync Conflict Safety

Firebase sync writes the whole state snapshot and uses client-side revisions. If two devices edit at nearly the same time from the same revision, the later write can overwrite part of the earlier write. This is acceptable for careful personal use, but it is the highest-risk area for multi-device reliability.

Recommended next step:

- Move toward per-domain/per-record merge metadata or Firestore transactions.
- Track dirty local changes persistently and retry failed cloud saves on next launch.
- Add tests for two-device same-revision saves.

### P1 - Explicit Zero Benefit Policy

The current app intentionally treats manual `benefitValue: 0` as "no manual override" so automatic benefit calculation can still populate default rewards. This matches the recent user request to auto-calculate missing practical benefits, but it means a user cannot yet explicitly say "this benefit should be zero even though the formula thinks otherwise."

Recommended next step:

- Add a separate field such as `manualBenefitOverride: true`.
- Then `benefitValue: 0` can become a real explicit zero.

### P2 - Formula Governance

Many formulas now work well for the user's actual patterns, but the formula engine is still partly code-driven and partly data-driven. This makes it easy to add cards quickly, but harder to prove every edge case.

Recommended next step:

- Create `docs/FORMULAS.md`.
- Define each benefit type, cap, point unit, pool, annual count, and user-pattern rule.
- Grow `tools/audit-check.mjs` into a fuller test suite.

### P2 - Mobile Data Commit Coverage

Monthly card spend is now well protected on iOS. Some other fields still rely on `change`/`blur`, including annual spend, benefit memo, and some benefit amount/count fields. These are less frequently edited than monthly spend, but they can still be lost if the user navigates immediately after typing.

Recommended next step:

- Add a generic `commitActiveInputBeforeAction` that handles card fields and usage fields, not only monthly card fields.

### P2 - Dashboard Input Speed

The dashboard is excellent for checking status, but monthly spend entry still happens mostly inside card detail. For month-end updating, the user must open each card.

Recommended next step:

- Add compact inline monthly spend editing or a quick-edit bottom sheet from dashboard cards.

### P2 - Backup/Restore Cloud Safety

Import/reset currently can propagate to cloud after confirmation. This is powerful but risky.

Recommended next step:

- Add "restore locally only" vs "restore and overwrite cloud" modes.
- Create an automatic pre-restore export.

### P3 - Data Hygiene

- `travel` category is referenced but missing from category definitions.
- `build:zip` depends on system `zip`, which is fragile on Windows.
- Service worker cache version is manually maintained.
- Some card benefit data still needs official-source review over time.

## Recommended Next Roadmap

1. Sync conflict safety and persistent retry.
2. Explicit manual-zero override.
3. Formula spec document plus broader formula tests.
4. Dashboard quick monthly spend edit.
5. Quick Pay mode for checkout situations.
6. Category/data hygiene pass.
7. Playwright smoke tests for mobile flows.

## Overall Assessment

The project has crossed from "prototype" into "personally useful beta." It can already save time and prevent missed benefits if used consistently. The highest-value near-term work is not adding many more cards; it is making the existing calculations and sync behavior auditable, predictable, and hard to accidentally corrupt.

