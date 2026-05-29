# Hosting behind a TLS reverse proxy (NPM, Caddy, Traefik, ...)

The default Docker stack runs everything on `localhost`: the SPA on `:3005`
and five Firebase services on their respective ports (`9099`, `8080`, `9000`,
`9199`, `5001`). To expose it on the public internet with TLS, you have two
shapes to choose from:

## Option A — subdomains (recommended)

One subdomain per service, each as a separate HTTPS Proxy Host with TLS
terminated at the proxy. Browser-friendly, works with any wildcard or per-host
cert.

**Example layout** (substitute your own domain):

| URL                               | Backend container & port    |
| --------------------------------- | --------------------------- |
| `https://r.example.com`           | `app:80`                    |
| `https://auth.example.com`        | `functions:9099`            |
| `https://firestore.example.com`   | `functions:8080`            |
| `https://rtdb.example.com`        | `functions:9000`            |
| `https://functions.example.com`   | `functions:5001`            |
| `https://storage.example.com`     | `functions:9199`            |

### What to configure on the proxy

Each subdomain is a regular HTTPS reverse proxy → HTTP backend on the
appropriate emulator port. In Nginx Proxy Manager:

1. Add a Proxy Host for each row above. Hostname = the subdomain, Forward
   Hostname = the docker host that runs the `functions` container (or the
   container name if NPM shares the docker network).
2. Forward Port = the corresponding port in the table.
3. SSL tab → request or upload a cert. With Let's Encrypt DNS-01 you can use
   a single wildcard cert (`*.example.com`) across all six entries.
4. For the RTDB host (`rtdb.example.com`), check **Websockets Support** —
   RTDB sync uses WS.
5. For the SPA host (`r.example.com`), check **Cache Assets** if you want.

### What to configure on the SPA build

`app/.env.self-hosted` already has placeholders. Fill them in with the URLs
you chose:

```
VITE_PUBLIC_APP_URL=https://r.example.com
VITE_FIREBASE_AUTH_URL=https://auth.example.com
VITE_FIREBASE_FIRESTORE_URL=https://firestore.example.com
VITE_FIREBASE_DATABASE_URL=https://rtdb.example.com
VITE_FIREBASE_FUNCTIONS_URL=https://functions.example.com
VITE_FIREBASE_STORAGE_URL=https://storage.example.com
```

Then rebuild the SPA container:

```
docker compose -f docker/docker-compose.yml build app && docker compose -f docker/docker-compose.yml up -d
```

And update `server/.env` so transactional emails carry the right hostname:

```
PUBLIC_APP_URL=https://r.example.com
```

Restart the functions container so it picks up the new env:

```
docker compose -f docker/docker-compose.yml restart functions
```

### What to configure on the browser extension

Update `browser-extension/config/configs/env/self-hosted.json`:

```json
{
  "WEB_URL": "https://r.example.com",
  "SESSIONS_URL": "https://r.example.com/sessions",
  "OTHER_WEB_URLS": [],
  "LANDING_PAGE_BASE_URL": "https://r.example.com",
  "logLevel": "info"
}
```

Rebuild and reload the unpacked extension:

```
cd browser-extension && bash build.sh self-hosted
```

## Option B — single hostname, multiple ports

If you'd rather keep everything under one hostname, expose ports `5001`,
`8080`, `9000`, `9099`, `9199` directly. Each port needs its own TLS
termination — in NPM that means using the **Streams** feature (raw TCP
forwarding with TLS termination per stream) rather than Proxy Hosts. This
works but custom-cert support in NPM Streams is finicky; if your cert won't
import, switch to Option A or let NPM generate a wildcard via Let's Encrypt
DNS-01.

Leave the `VITE_FIREBASE_*_URL` vars empty in this case. The SPA falls back
to `<current hostname>:<emulator port>` which is what you want.

## Why subdomains and not path prefixes

The Firebase JS SDK strips path components from emulator host strings for
Auth, Firestore, and RTDB. Path-based routing like
`r.example.com/_firestore/...` therefore can't work for those services even
with a happy reverse proxy. Subdomains are the only path the SDK respects
end-to-end.
