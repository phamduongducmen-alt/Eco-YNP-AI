# AI Life World — Security & Privacy Specification

## 1. Encryption & Key Management
- **Client-Side AES-256-GCM Vault** (`src/utils/cryptoVault.ts`): Encrypted mood journals and cloud wellness sync snapshots are encrypted in the browser with Web Crypto (`AES-GCM`, 256-bit key, random 96-bit IV per payload) before persistence or upload to Cloud Firestore.
- **Key Rotation**: Users can rotate their device AES-256-GCM key at any time inside the Profile & Security modal.
- **Zero Server-Side Plaintext Secrets**: `GEMINI_API_KEY` is read strictly server-side in `server.ts` (`process.env.GEMINI_API_KEY`) and never exposed to client bundles or UI inputs.

## 2. Explicit Permissions & Consent
Users explicitly control granular permissions stored in `AppPersistentState.permissions`:
- `camera`: Required before invoking `navigator.mediaDevices.getUserMedia` for AI posture analysis.
- `microphone`: Required before invoking voice dictation / audio capture.
- `healthData`: Controls local tracking of physical metrics.
- `allowAiPersonalData`: Controls whether sanitized profile/nutrition summaries are sent with `/api/assistant/chat` requests. Defaults to `false`.
- `notifications`: Controls browser reminder notifications.

## 3. Firebase Firestore Security Rules (`firestore.rules`)
- Strict user ownership (`request.auth.uid == userId`) across `/users/{userId}`, `/users/{userId}/private/{docId}`, `/users/{userId}/wellnessSync/{docId}`, and `/users/{userId}/encryptedJournals/{entryId}`.
- Default-deny catch-all rule (`match /{document=**} { allow read, write: if false; }`).
- Schema validation on create/update enforcing bounded string lengths, numeric ranges, and immutable ownership fields (`uid` / `ownerId`).

## 4. Data Sovereignty
- Full JSON export (`ai-life-world-backup-YYYY-MM-DD.json`) available in one click.
- Full local + cloud data wipe with inline confirmation.
- On-device security access audit log recording authentication, permission changes, encryption actions, and data exports.
