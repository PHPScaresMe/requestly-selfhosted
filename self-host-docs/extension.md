# Self-hosting the browser extension

The Requestly Chrome/Firefox/Safari extension is what actually intercepts and fires
network requests. Without it, the SPA can build and save rules + API client requests
but can't execute them. The extension's build pipeline already supports per-environment
config — we just add a `self-hosted` env that points at your deployment instead of
`app.requestly.io`.

## Easy path — built and served by the SPA container

`docker compose -f docker/docker-compose.yml build app` builds the extension
during the SPA image build (with `WEB_URL` derived from `VITE_PUBLIC_APP_URL`
in `app/.env.self-hosted`), zips it, and exposes it as a download at
`<your SPA URL>/extension.zip`. There's also an in-app "Install Extension"
panel that links to that URL.

To install:

1. Download from `https://<your SPA URL>/extension.zip`.
2. Unzip somewhere.
3. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick
   the unzipped folder.
4. Reload the SPA — the "install extension" banner should disappear and rules
   should fire.

If you change `VITE_PUBLIC_APP_URL` later, rebuild the app image and
redistribute the new zip.

## Manual build (if you want to side-load without going through the SPA)

From the repo root:

```bash
# One-time install (~3 min)
bash browser-extension/install.sh

# Build the extension targeting your self-hosted instance.
# Both `bash build.sh self-hosted` and `ENV=self-hosted bash build.sh` work.
cd browser-extension
bash build.sh self-hosted
```

Output: `browser-extension/mv3/dist/`.

The build wipes `browser-extension/config/dist/config.build.json` at the start to
prevent a stale prior build from poisoning the URL config. Don't worry if you see
that file get recreated each run.

The build reads `browser-extension/config/configs/env/self-hosted.json` (already in the
repo). Default points at `http://localhost:3005`. If your deployment lives somewhere
else — your LAN IP, a real domain, anything — edit that file before building:

```json
{
  "WEB_URL": "https://requestly.mycompany.com",
  "SESSIONS_URL": "https://requestly.mycompany.com/sessions",
  "OTHER_WEB_URLS": ["http://localhost:3005"],
  "LANDING_PAGE_BASE_URL": "https://requestly.mycompany.com",
  "logLevel": "info"
}
```

`OTHER_WEB_URLS` is useful for accepting multiple host aliases (e.g. localhost during
local dev plus the deployed hostname). All URLs are translated into content-script
match patterns in the generated `manifest.json` so the extension knows where to inject
itself.

## Side-load into Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked**.
4. Pick `browser-extension/mv3/dist/`.

The extension icon should appear in your toolbar. Open your self-hosted instance —
the SPA detects the extension via a DOM attribute its content script writes
(`document.documentElement.getAttribute("rq-ext-version")`). The "extension required"
banner should disappear and the API client should be able to fire requests.

## Firefox / Edge / Safari

Same build script, the rollup config emits the right manifest per browser. The
side-load procedure differs:
- **Firefox**: `about:debugging` → **This Firefox** → **Load Temporary Add-on** → pick
  `manifest.json` from the dist folder. Reverts on Firefox restart unless signed.
- **Edge**: same as Chrome (`edge://extensions`, Developer mode, Load unpacked).
- **Safari**: requires Xcode to wrap; out of scope for v1.

## Troubleshooting

- **The "install the extension" banner doesn't go away.** The extension is installed
  but its content script didn't run on your page — usually because the match pattern
  in the manifest doesn't include your hostname. Open `chrome://extensions` → click
  **Details** on the Requestly entry → **Inspect views: service worker** → in the
  console, run `chrome.runtime.getManifest().content_scripts[0].matches`. If your
  self-host URL isn't there, rebuild with the right `WEB_URL` and reload the extension.

- **Rules don't fire / API client requests fail.** Check the service worker console
  for errors. Most extension-side comms go through the content script first; if
  `app.cs.js` isn't injecting, the SPA can't reach the service worker. Make sure
  your `WEB_URL` exactly matches the hostname in the browser address bar (protocol
  + port included).
