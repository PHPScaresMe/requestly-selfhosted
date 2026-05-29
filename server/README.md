# Requestly self-hosted server

Open-source reimplementation of the proprietary `requestly-backend`. Runs as Firebase Cloud
Functions on top of the Firebase Emulator Suite. See `/CLAUDE.md` in the repo root for the
full architecture and pickup point.

## Layout

- `functions/` — Cloud function implementations (TypeScript). One file per group (auth, teams,
  invites, billing, etc.); each file exports the named functions referenced by the client.
- `firebase.json` — Emulator + functions config.
- `firestore.rules` — Firestore security rules.
- `database.rules.json` — RTDB security rules.
- `storage.rules` — Cloud Storage rules.

## Running

See `docker/docker-compose.yml` in the repo root. For local dev outside Docker:

```bash
cd server/functions && npm install && npm run build
cd .. && npx firebase emulators:start --only auth,firestore,database,storage,functions
```
