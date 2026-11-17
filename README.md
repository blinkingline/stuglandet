# Cabin Country (working title)

Two-player 3x3 cabin-building game. Original art and tile set; the rules engine follows the published rules sheet.
Play the computer, or send an invite link to a friend.

## Layout
- `src/engine.ts` pure rules engine (shared by browser, server and AI): setup, weighted roll, place/move/swap, blocking, scoring
- `src/tiles.ts` tile data: a 3x2 grid of slots per tile (`P` plot, `W` lake, `D` dump, `T` trees, `H` haystacks, `.` grass)
- `src/art.ts` inked-cartoon SVG tiles and cabin sprites
- `src/ai.ts` computer opponent (1-ply score lookahead, reroll by expected value, a little noise)
- `src/main.ts` UI: menu, board, animated roll, invite banner; `src/net.ts` reconnecting WebSocket client
- `server/` authoritative game server: one in-memory room per invite link, reconnect tokens, rematch; also serves `dist/`

## Develop
    npm install
    npm run dev:server     # game server on :8787
    npm run dev            # client on :5173 (proxies /ws to :8787)
    npm test               # engine, AI and server tests

## Deploy (cloudstuff -> cabins.geeb.us)
1. DNS: A record `cabins.geeb.us` -> cloudstuff.
2. On cloudstuff: `git clone <repo> ~/stuglandet && cd ~/stuglandet && npm ci && npm run build`
3. `sudo cp deploy/cabin-country.service /etc/systemd/system/` (edit User/WorkingDirectory), then
   `sudo systemctl daemon-reload && sudo systemctl enable --now cabin-country`
4. Add the vhost from `deploy/Caddyfile.snippet` or `deploy/nginx.conf.snippet` (the proxy must pass websockets) and reload it.
5. Later updates: `./deploy/deploy.sh`

Games live in server memory: restarting the service ends games in progress.
