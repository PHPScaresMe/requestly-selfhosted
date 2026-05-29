#!/usr/bin/env bash

# Pick env from the first positional arg OR the ENV env var. Both work:
#   bash build.sh self-hosted
#   ENV=self-hosted bash build.sh
ENV="${1:-${ENV:-}}"

if [ -n "$ENV" ]; then
  echo -e "\n\033[1;37m\033[44m***** Target env: $ENV *****\033[0m"
fi

echo -e "\n\033[1;37m\033[44m***** Generating Configuration *****\033[0m"
cd config
# Wipe the prior generated config — the generator merges with whatever was last built,
# which means switching ENV between builds can silently keep stale URLs.
rm -rf dist
ENV="$ENV" npm run build
cd ..

echo -e "\n\033[1;37m\033[44m***** Building analytics vendors *****\033[0m"
cd ../common/analytics-vendors
npm run build
cd ../../browser-extension

echo -e "\n\033[1;37m\033[44m***** Building Common Code *****\033[0m"
cd common
npm run build
cd ..

echo -e "\n\033[1;37m\033[44m***** Building MV3 extension *****\033[0m"
cd mv3
npm run build:current
cd ..

# SessionBear extension is not used anymore so the source code is deprecated and will be removed in the future
# echo -e "\n***** Building SessionBear extension *****"
# cd sessionbear
# npm run build:current
# cd ..
