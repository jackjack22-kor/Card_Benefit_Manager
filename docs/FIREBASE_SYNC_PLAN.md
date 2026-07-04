# Firebase Sync Plan

CardFit cloud sync implementation plan. Keep local-first behavior as the default: signed-out users continue using localStorage only, and signed-in users get Firebase Auth + Firestore sync on top of the same local state.

## Product Decision

- Signed out: local-only mode, exactly like the current app.
- Signed in: local cache remains the source for fast UI, Firestore sync runs in the background.
- Manual JSON backup/export stays available even after cloud sync.
- Cloud sync must never delete local data automatically during first sign-in.
- Firebase project/app display name: `CardFit`.
- Initial scope: personal-only. Public multi-user distribution can reuse the same auth-per-user model later, but needs stronger onboarding, card selection, privacy, quota, and support design.
- Recommended Firestore location for the current personal app: `asia-northeast3` (Seoul regional), because the primary user is in Korea and the app is small enough that lower latency matters more than multi-region SLA.
- Recommended first sign-in merge UX: show a confirmation, then smart-merge local data with cloud. If cloud is empty, upload local state. If a new device has no local data, pull cloud state. Never silently overwrite local data.

## User Setup Checklist

The user needs to create/configure Firebase before code can be connected:

1. Create a Firebase project in the Firebase Console.
2. Register a Web app and copy the Firebase config object.
3. Enable Authentication > Sign-in method > Google.
4. Add authorized domains:
   - `localhost`
   - `127.0.0.1`
   - `jackjack22-kor.github.io`
5. Create Cloud Firestore in production mode.
6. Paste the Firestore rules from this document.
7. Share only the Web app Firebase config values with Codex.

The Firebase web config is safe to ship in the client, but Firestore rules must be strict because the app runs on GitHub Pages.

## Proposed Firestore Model

Start with a single current snapshot. It is the safest first version because the existing app already stores one migrated state object.

```text
users/{uid}/private/cardfit
  appId: "cardfit"
  schemaVersion: "2.0.0"
  updatedAt: serverTimestamp
  clientUpdatedAt: ISO string
  deviceId: string
  revision: number
  state: object
```

Later, if concurrent multi-device editing becomes painful, split high-churn data by month:

```text
users/{uid}/months/{yyyy-MM}
users/{uid}/settings/current
users/{uid}/usage/{yyyy-MM}
```

Do not start split-schema first. It increases migration and merge complexity before we know it is needed.

## Security Rules Draft

```js
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/private/{docId} {
      allow read, create, update, delete: if request.auth != null && request.auth.uid == userId;
    }

    match /users/{userId}/{document=**} {
      allow read, write: if false;
    }
  }
}
```

Notes:

- The app should only use `users/{uid}/private/cardfit` in v1.
- The deny-all fallback prevents accidental public collections.
- If we later add monthly documents, rules must explicitly allow those paths.

## Code Architecture

Add Firebase as optional infrastructure, not as a hard requirement.

```text
src/lib/storage.js
  current localStorage state, migration, import/export

src/lib/sync/firebaseConfig.js
  exported Firebase config placeholder, disabled when config is missing

src/lib/sync/firebaseClient.js
  initializeApp, getAuth, GoogleAuthProvider, getFirestore

src/lib/sync/cloudStore.js
  loadCloudSnapshot, saveCloudSnapshot, subscribeCloudSnapshot

src/lib/sync/syncManager.js
  sign-in state, initial merge, debounce upload, remote listener, conflict handling
```

`main.js` should not call Firebase directly. It should call a small sync manager API:

```js
initSync({ getState, applyRemoteState, onStatusChange });
requestSignIn();
requestSignOut();
queueCloudSave(state);
```

## Merge Policy

First sign-in needs a visible, conservative flow.

1. If cloud is empty: upload current local state.
2. If local is empty and cloud exists: apply cloud state to local.
3. If both exist:
   - Default recommendation: merge.
   - Keep card catalog from code, not cloud.
   - For primitive UI settings, use latest `updatedAt`.
   - For `monthlyCardUsage`, merge by month/card field.
   - For `usage`, merge by benefit/month field.
   - Preserve all notes/memos unless the same exact field differs; then latest field timestamp wins when available.

Because current state does not track per-field timestamps, v1 merge should add:

```js
syncMeta: {
  deviceId,
  lastCloudSyncAt,
  lastLocalEditAt,
  revision
}
```

For the first implementation, use whole-state last-write-wins after explicit first merge. Add per-field timestamps only if real conflicts appear.

## UI Plan

Settings/Backup tab gets a Cloud Sync section:

- Signed out:
  - Google login button
  - Short explanation: "로그인하면 이 기기의 데이터를 클라우드에 백업하고 다른 기기와 동기화합니다."
- Signed in:
  - account email/name
  - sync status: synced / syncing / offline / error
  - last synced time
  - manual sync button
  - sign out button
- First sign-in:
  - show "local data found" notice
  - upload/merge local data into cloud, never overwrite silently

Keep JSON backup immediately below Cloud Sync.

## Implementation Phases

### Phase 1: Safe Foundation

- Add Firebase dependency. (done)
- Add CardFit Firebase web config. (done)
- Add sync status UI in Settings/Backup. (done)
- No behavior change for signed-out users. (done)

### Phase 2: Auth

- Enable Google sign-in/sign-out. (implemented in app; Firebase Console provider/domain setup still required)
- Persist auth session in browser. (done)
- Add authorized domain guidance to docs.

### Phase 3: Firestore Snapshot

- Save/load `users/{uid}/private/cardfit`. (done)
- Debounce writes to reduce Firestore usage. (done)
- Upload local state on first sign-in when cloud is empty. (done)
- Keep localStorage updated after remote state applies. (done)

### Phase 4: Conflict Safety

- Add deviceId/revision.
- Detect remote revision newer than local.
- Show a non-blocking status if remote changes arrive while editing.
- Keep JSON export as fallback.

### Phase 5: Verification

- Desktop Chrome: local-only, sign-in, sync, sign-out.
- Android Samsung Browser/PWA: login and reload persistence.
- iPhone Safari/PWA: Google login redirect/popup behavior, reload persistence.
- GitHub Pages production URL.
- Offline mode: edit locally, reconnect, upload.

## Open Questions for User

1. Confirm Firebase project/app display name as `CardFit`.
2. Confirm Firestore location as `asia-northeast3` (Seoul regional), unless the user prefers multi-region US for availability over latency.
3. Google Analytics: probably off for this personal utility unless the user wants usage stats.
4. Initial cloud merge UX: confirmation screen + smart default merge.
5. Multi-user scope: personal-only for now. Public distribution is a future product track.

## References

- Firebase Web setup: https://firebase.google.com/docs/web/setup
- Firebase Google sign-in for Web: https://firebase.google.com/docs/auth/web/google-signin
- Cloud Firestore Security Rules: https://firebase.google.com/docs/firestore/security/get-started
- Firestore offline persistence: https://firebase.google.com/docs/firestore/manage-data/enable-offline
