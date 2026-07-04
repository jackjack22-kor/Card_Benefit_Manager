# Structural Hardening Report - 2026-07-05

## Scope

This pass closes the remaining low-priority structural hardening items from the full audit:

1. Same-field multi-device conflict handling.
2. `main.js` readability and responsibility reduction.
3. Firebase bundle optimization.
4. CSP/security hardening.

Four read-only sub-agent reviews were used:

- Sync conflict and concurrent editing audit.
- Firebase bundle and lazy loading audit.
- CSP/security audit.
- `main.js` refactoring audit.

## Implemented

### Sync Conflicts

- Added `syncConflicts` to persisted state.
- `syncManager` now remembers the last synced base state.
- During Firestore transaction writes, if cloud state moved ahead, the manager detects leaf-level conflicts for:
  - `monthlyCardUsage`
  - `usage`
  - `cardOverrides`
  - `notes`
  - `settings.pointValues`
  - `cardOrder`
- Same-field conflicts preserve `baseValue`, `localValue`, and `remoteValue`.
- Settings tab now shows a conflict card only when conflicts exist.
- User can choose:
  - Keep local value.
  - Apply remote value.
- Focused inputs are committed/blurred before remote apply to reduce loss of in-progress mobile edits.
- Drag-based card sorting now uses `persistState`, so order changes are queued for cloud sync.

### Firebase Bundle Optimization

- Replaced direct `main.js -> syncManager.js` import with `src/lib/sync/lazySync.js`.
- Firebase Auth/Firestore SDKs are now loaded through `import('./syncManager.js')`.
- Runtime loads when:
  - Settings tab is opened.
  - Cloud sign-in/sign-out/sync action is requested.
- Main entry chunk dropped from roughly 794KB to roughly 116KB in the verified build.
- Firebase remains a large async chunk, but it no longer blocks first dashboard load.

### CSP

- Added a GitHub Pages-compatible meta CSP to `index.html`.
- Policy keeps current inline build working while narrowing:
  - `default-src`
  - `base-uri`
  - `object-src`
  - `frame-src`
  - `connect-src`
  - `form-action`
  - `worker-src`
- Firebase/Auth domains are explicitly allowed.

### Readability

- Added `src/lib/ui/constants.js` for app-level UI constants:
  - primary recommendation categories
  - UI-state keys preserved across remote sync
  - backup file-size limit
- Kept high-risk large screen render functions in `main.js` to avoid unnecessary UI regression.

### Regression Guards

- `npm run audit:check` now verifies:
  - `main.js` does not statically import `syncManager.js`.
  - `lazySync.js` keeps the Firebase runtime dynamically imported.
  - `index.html` includes CSP metadata.

## Verification

Commands run:

```bash
npm run audit:check
npm run build:pages
```

Results:

- `npm run audit:check`: passed.
- `npm run build:pages`: passed.
- Vite still warns that the Firebase async chunk is larger than 500KB. This is expected; the important improvement is that the first-load entry chunk is now small.

## Notes

- GitHub Pages web-app usage is the primary supported deployment mode.
- Downloaded single HTML can still run the local app, but cloud login depends on async chunk files being available beside the generated HTML. For cloud sync, use the GitHub Pages deployment.
- Conflict handling is practical same-field detection, not a full CRDT. For this personal app, it is enough to prevent silent data loss and expose rare conflicts clearly.
