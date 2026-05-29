#!/usr/bin/env bash
set -euo pipefail

# Self-host Firebase Emulator Suite entrypoint.
#
# We export emulator state to /data/export so it persists across container
# restarts. Subdirectory is required because firebase-tools rmdir's the export
# target on shutdown, which fails (EBUSY) when the target is itself a volume
# mountpoint.
#
# `exec` is critical: it replaces this shell with firebase-tools so SIGTERM
# from `docker stop` reaches the emulator directly and triggers --export-on-exit.

mkdir -p /data/export

IMPORT_ARGS=()
if [ -f /data/export/firebase-export-metadata.json ]; then
  IMPORT_ARGS=(--import /data/export)
  echo "Importing emulator state from /data/export"
else
  echo "No prior emulator state found; starting fresh"
fi

exec firebase emulators:start \
  --project requestly-self-hosted \
  --only auth,firestore,database,storage,functions \
  "${IMPORT_ARGS[@]}" \
  --export-on-exit /data/export
