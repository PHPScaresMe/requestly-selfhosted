# Multi-stage build for the Requestly SPA in self-hosted mode.

FROM node:20-bookworm-slim AS build
WORKDIR /repo

# Build deps for native modules (tree-sitter, etc.). Plus `zip` so we can package
# the browser extension at the end of the build. All of this gets discarded by
# the final nginx stage.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates git zip \
 && rm -rf /var/lib/apt/lists/*

# Copy the whole monorepo — the app depends on @requestly/shared (file:..) and
# @requestly/requestly-core (file:..) which both live at the repo root.
COPY package.json package-lock.json index.js rollup.config.js ./
COPY .babelrc ./
COPY shared ./shared
COPY common ./common
COPY app ./app
COPY browser-extension ./browser-extension

# Install root + workspaces. Skip husky / scripts that assume git.
ENV HUSKY=0
RUN npm install --no-audit --no-fund
# Build common deps first — root build (rollup) imports from common/rule-processor/dist/.
RUN cd common/rule-processor && npm install --no-audit --no-fund && bash build.sh
RUN cd common/analytics-vendors && npm install --no-audit --no-fund && bash build.sh
# Build @requestly/requestly-core (file:..) → dist/requestly-core.{cjs,esm}.js so the
# app's `file:..` import resolves.
RUN npm run build
RUN cd shared && npm install --no-audit --no-fund && npm run build
RUN cd app && npm install --no-audit --no-fund

# Use the self-hosted env file.
COPY app/.env.self-hosted /repo/app/.env

WORKDIR /repo/app
# Vite build of this app needs >2GB of heap. Default is ~1.5GB.
ENV NODE_OPTIONS="--max-old-space-size=6144"
RUN npm run build
WORKDIR /repo

# Build the browser extension targeting the self-hosted SPA URL.
#
# The extension's manifest content-script `matches` pattern is derived from
# `WEB_URL` in `browser-extension/config/configs/env/self-hosted.json`. To keep
# the user from having to edit that file separately, we regenerate it here from
# `VITE_PUBLIC_APP_URL` in the SPA's env (already in `/repo/app/.env` thanks to
# the COPY above). Output: /repo/browser-extension/mv3/dist/
RUN cd browser-extension/common && npm install --no-audit --no-fund
RUN cd browser-extension/mv3 && npm install --no-audit --no-fund
COPY docker/build-extension.sh /usr/local/bin/build-extension.sh
RUN chmod +x /usr/local/bin/build-extension.sh && /usr/local/bin/build-extension.sh

# Zip the extension dist so the SPA can serve it as a static download.
# The archive contains the files directly (not nested under a `dist/` folder)
# so the user can extract it and point chrome://extensions → "Load unpacked"
# at the resulting directory.
RUN cd browser-extension/mv3/dist && zip -r /repo/app/build/extension.zip .

FROM nginx:1.27-alpine AS runtime
COPY --from=build /repo/app/build /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
