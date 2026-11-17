#!/usr/bin/env bash
# Run ON cloudstuff, from the repo checkout: ./deploy/deploy.sh
set -euo pipefail
git pull --ff-only
npm ci
npm run build          # vite build (client -> dist/) + esbuild (server -> dist-server/)
sudo systemctl restart cabin-country
sleep 1
curl -fsS http://127.0.0.1:8787/healthz && echo " <- cabin-country is up"
