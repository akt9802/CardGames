# Baithak (CardGames)

Late-night parlor for four South Asian / folk card games: **Bluff**, **Call Break**, **Mendi Coat**, and **Cabo**. Live multiplayer with optional computer chairs, invite-only access, profiles, PWA, and web push.

Live site: **https://games.zakarias.in**

This is a **single monorepo**. One Node process serves the API, Socket.IO, and the built React client. There is no Postgres, Redis, or Celery.

Server checkout on the box:

```text
/home/alok-aman/games/CardGames
```

---

## What a player actually does

1. **Request a chair** at `/request-access` (name, personal email, reason).
2. Staff open **`/errorPagesBro`**, approve or reject.
3. Approval email goes to that address with a signup link: `/signup?email=…`.
4. Signup: email → 6-digit OTP (resend after 60s) → username, password, optional table name.
5. Sign in at `/login`. Forgot password at `/forgot-password` (email or username → OTP → new password). Sign out from the hall, landing, or profile (revokes access + refresh tokens and unbinds push).
6. In the **hall** (`/lobby`): open a table, join by code, or play solo vs computers.
7. **People** (`/people`): see everyone who signed up, open **any chair** (`/people/:id`), **ping**, or **invite**. Portrait, table name, and Instagram are public; phone and email stay private.
8. A **table** is a sitting, not one game. Host picks Bluff / Call Break / Mendi / Cabo when dealing. After a hand, **Another game at this table** keeps the same room.
9. **Profile** (`/profile`): table name, phone (private), Instagram, portrait, push chimes, PWA hint.

Staff credentials default to `zakAddKK` / the password in `.env.example`. Override with `ADMIN_USERNAME` and `ADMIN_PASSWORD`.

---

## Architecture

```text
Browser (Vite React SPA + service worker)
    │  HTTP /api, /photos, static
    │  WebSocket /socket.io
    ▼
Express + Socket.IO  (server/index.ts, default :3001)
    ├── access.ts     invite requests, OTP, admin tokens
    ├── auth.ts       users, scrypt passwords, session tokens
    ├── rooms.ts      tables, seats, deal / play / return-to-lobby
    ├── engine/*      server-authoritative rules
    ├── mail.ts       Brevo SMTP (approval + OTP)
    ├── push.ts       Web Push (VAPID / web-push)
    └── store.ts      JSON + photos under server/data/
```

| What | Where | Survives restart? |
|---|---|---|
| Users (hash, profile, email) | `server/data/users.json` | Yes |
| Access requests | `server/data/access.json` | Yes |
| OTPs (hashed) | `server/data/otps.json` | Yes |
| Refresh tokens (hashed) | `server/data/refresh.json` | Yes |
| Push subscriptions | `server/data/push.json` | Yes |
| VAPID keys (if auto-generated) | `server/data/vapid.json` | Yes |
| Portraits | `server/data/photos/` | Yes |
| Access tokens, live sockets | In-memory | **No** — the client refreshes the 15-minute access token after a restart |
| Rooms, in-progress games, table chat | `server/data/parlor.json` | Yes |
| Hall chat | `server/data/parlor.json` | Yes |
| Invites and pings | `server/data/invites.json` | Yes |

Shared types and legal-move helpers live in `shared/` and are imported by both client (`@shared`) and server.

### Local vs production

| | Dev | Production |
|---|---|---|
| Client | Vite `:5173`, proxies `/api`, `/socket.io`, `/photos` → `:3001` | `npm run build` → `dist/`, Express serves it |
| Server | `tsx watch server/index.ts` | Docker `npm start` (`tsx server/index.ts`) |
| Mail | If SMTP key empty, OTP is logged and returned in JSON | Brevo SMTP |
| Push | Works on `http://localhost` in Chrome | Needs **HTTPS** on `games.zakarias.in` |

```bash
npm install
npm run dev          # client :5173 + server :3001
```

```bash
npx tsc --noEmit
npx tsx scripts/e2e.ts    # needs server on :3001, SMTP unset so OTP is echoed
```

---

## Routes

| Path | Who |
|---|---|
| `/` | Landing |
| `/request-access` | Ask for a chair |
| `/signup` | Approved guests: email → OTP → password. Resend after 60s. |
| `/login` | Sign in |
| `/forgot-password` | Reset via email or username + OTP |
| `/lobby` | Hall, open/join tables, solo |
| `/people` | Directory, ping, invite (`?table=` attaches to an open table) |
| `/people/:id` | Anyone's public chair (portrait, name, Instagram, online) |
| `/profile` | Your chair + push + portrait (phone/email private) |
| `/table/:id` | Waiting room; host picks game and deals |
| `/play/:id` | Live hand |
| `/errorPagesBro` | Staff ledger (not linked from the parlor) |
| `/register` | Redirects to `/request-access` |

---

## Access, mail, and OTP

Open `/api/register` is closed (`403`). Flow:

```text
POST /api/access/request
  → staff POST /api/admin/login
  → GET  /api/admin/requests?status=PENDING
  → POST /api/admin/requests/:id/approve   # emails signup link
  → POST /api/signup/request-otp
  → POST /api/signup/resend-otp     # new code; 60s cooldown
  → POST /api/signup/verify-otp
  → POST /api/signup/complete       # { token, refresh_token, expires_in, user }
```

Forgot password (does not say whether the chair exists):

```text
POST /api/password/request-otp      # { email } — email or username
  → POST /api/password/resend-otp
  → POST /api/password/verify-otp   # → reset_token
  → POST /api/password/reset        # new password; signs you in
```

OTP: 6 digits, HMAC digest, 10 minutes, 5 guesses, 60s resend cooldown. Signup and reset codes are separate (you cannot reuse a signup code to reset a password). The code in mail is **one copyable span**.

Access token lives **15 minutes** (in memory). Refresh token lives **30 days** (hashed in `refresh.json`), rotates on each use. Reusing a rotated refresh token kills that session family. Client sends `Authorization: Bearer <access>` and silently calls `POST /api/auth/refresh` on 401 or shortly before expiry. Socket handshake uses the access token.

`PUBLIC_URL` must be the URL people actually open (`https://games.zakarias.in`). Approval mail uses `{PUBLIC_URL}/signup?email=…`.

If `BREVO_SMTP_KEY` is empty, mail is logged and OTP endpoints include `otp` in the JSON (local / e2e only).

---

## Tables, people, and push

- **Create** a table with chair count (2–8). Game is optional until deal.
- Host **configures** game, chairs, trump, Call Break rounds, fill-bots, then **Deal**.
- After `game.phase === "over"`, host **Another game at this table** → same seats, pick a new game.
- **Invite**: creates a table (or uses `?table=`) and notifies the guest. **Ping**: nudge, optionally toward a table.
- Push fires on: invite/ping, table dealing, someone sitting (host away), your turn while disconnected. Profile toggle; login re-binds the device; logout drops the server row but keeps browser permission (iOS-friendly).

Every `push` handler **always** `showNotification` — a silent push kills the iOS subscription.

---

## Games (what this build actually plays)

Implemented in `server/engine/` with client legal-move helpers in `shared/legal.ts`. Folk rules, not casino apps.

| Game | Chairs | Notes |
|---|---|---|
| **Bluff** | 3–8 | Face-down claims; call bluff. 6+ uses two decks. |
| **Call Break** | 4 or 8 | Bid tricks. 8 players = two decks. Trump: classic (Spades), power card, or cut. 3 or 5 deals. Make = call + 0.1/overtrick; miss = −call. |
| **Mendi Coat** | 4 or 6 | Partnerships. Hunt tens. 4 = 2v2 × 13 cards; 6 = strip 2s, 8 cards, 3v3. First to 5 hands. Trump: closed tuck, power, or cut. |
| **Cabo** | 2–6 | Four face-down cards; peek bottom two. KD = 0, other K = 13. Powers 7–8 / 9–10 / J–Q. Call Cabo → others one more turn. Folk/PyCon rules, not Eventide. |

Tricks linger on the felt (~3s) so the last trick stays visible. Whose turn is highlighted on seats.

Hall / table / team chat; rules rail on play. Computers fill empty chairs; Mendi partners sit opposite / alternate.

Source notes: `bluff/gameInfo.md`, `callBreak/gameInfo.md`, `mendi/gameInfo.md`, `cabo/gameInfo.md`.

---

## HTTP API (auth except where noted)

| Method | Path | |
|---|---|---|
| POST | `/api/access/request` | `{ name, email, reason }` |
| POST | `/api/signup/request-otp` | `{ email }` |
| POST | `/api/signup/resend-otp` | `{ email }` — new code, 60s cooldown |
| POST | `/api/signup/verify-otp` | `{ email, otp }` → `setup_token` |
| POST | `/api/signup/complete` | `{ setup_token, username, password, displayName? }` → session |
| POST | `/api/login` | `{ username, password }` → `{ user, token, refresh_token, expires_in }` |
| POST | `/api/auth/refresh` | `{ refresh_token }` → new session (rotates refresh) |
| POST | `/api/password/request-otp` | `{ email }` email or username |
| POST | `/api/password/resend-otp` | `{ email }` |
| POST | `/api/password/verify-otp` | `{ email, otp }` → `reset_token` |
| POST | `/api/password/reset` | `{ reset_token, password }` → session |
| POST | `/api/logout` | Bearer access; body may include `refresh_token` |
| GET/POST | `/api/me` | Own profile; POST `{ displayName, phone, instagram }` |
| POST | `/api/me/photo` | `{ image: dataUrl }` JPEG/PNG/WebP ≤ 1.5 MB |
| GET | `/api/people` | Directory + `online` |
| GET | `/api/people/:id` | Public chair (no phone/email) |
| GET | `/api/invites` | Pending ping/invite cards |
| POST | `/api/invites/:id/dismiss` | |
| POST | `/api/people/:id/ping` | `{ roomId? }` |
| POST | `/api/rooms/:id/invite` | `{ userIds }` |
| GET | `/api/push/vapid` | Public VAPID key |
| POST | `/api/push/subscribe` | PushSubscription JSON |
| POST | `/api/push/unsubscribe` | `{ endpoint }` |
| POST | `/api/push/test` | Trial chime |
| POST | `/api/admin/login` | `{ username, password }` |
| POST | `/api/admin/logout` | Staff token |
| GET | `/api/admin/requests` | `?status=PENDING\|APPROVED\|REJECTED` |
| POST | `/api/admin/requests/:id/approve` | |
| POST | `/api/admin/requests/:id/reject` | `{ reason? }` |
| GET | `/healthz` | Compose healthcheck |
| GET | `/photos/:file` | Portraits |

Tokens: `Authorization: Bearer <access>`. Access dies on process restart or after 15 minutes; call `/api/auth/refresh`. Logout revokes that refresh family.

### Socket.IO (auth handshake `{ token }`)

`lobby:chat`, `room:create`, `room:join`, `room:leave`, `room:ready`, `room:fillBots`, `room:configure`, `room:start`, `room:again`, `room:chat`, `game:action`, `solo:start`.

Server → client: `hello`, `lobby:tables`, `lobby:chat`, `room:state`, `room:left`, `invite:incoming`.

---

## Tree

```text
client/          Vite React 19 UI (root of vite.config)
  public/        PWA icons, manifest, sw.js
  src/pages/     Landing, auth, lobby, people, profile, table, play, admin
server/
  index.ts       HTTP + sockets
  engine/        bluff, callBreak, mendi, cabo, bots
  data/          JSON + photos (gitignored except .gitkeep)
shared/          types, cards, legal, rules copy
nginx/games      vhost drop-in for games.zakarias.in
Dockerfile
docker-compose.yml
deploy.sh
.env.example
```

---

## Environment

Copy `.env.example` → `.env` (never commit `.env`).

| Variable | Purpose |
|---|---|
| `PORT` | Listen port **inside** the container (`3001`) |
| `HOST_PORT` | Host loopback port (`3010`) — **do not use 3001**, FinSense already has it |
| `PUBLIC_URL` | Canonical HTTPS origin for mail + signup links |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Staff door |
| `OTP_SECRET` | HMAC secret for OTPs (set a long random string in prod) |
| `OTP_MAX_ATTEMPTS` | Guess limit per OTP (default `5`) |
| `BREVO_SMTP_*` / `EMAIL_FROM_ADDRESS` | Transactional mail |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push. Empty → generated into `server/data/vapid.json` |
| `VAPID_CONTACT` | `mailto:` or `https:` (Apple rejects anything else) |

Changing VAPID keys invalidates every existing push subscription.

---

## Deploy (production)

### Layout on the box

Same machine as FinSense / Prasikshan / Snipio / Runve. Nginx on the host; app in Docker bound to **loopback**.

| Service | Host port |
|---|---|
| Prasikshan | 3000 |
| FinSense | **3001** |
| Snipio web / socket | 3002 / 3003 |
| **Baithak** | **3010** → container 3001 |
| Runve | 8000 |

DNS: `games.zakarias.in` (and `www` if you want it) → this machine.

### 1. Code

```bash
cd /home/alok-aman/games/CardGames
# first time: git clone <repo> .
git pull --ff-only
```

### 2. Env

```bash
cp .env.example .env
nano .env
```

Set at least:

- `PUBLIC_URL=https://games.zakarias.in`
- `HOST_PORT=3010`
- `OTP_SECRET=` a long random string
- Brevo `BREVO_SMTP_USER`, `BREVO_SMTP_KEY`, `EMAIL_FROM_ADDRESS`
- `VAPID_CONTACT=mailto:you@yourdomain`
- Optionally generate VAPID: `npx web-push generate-vapid-keys` and paste both keys; otherwise first boot writes `server/data/vapid.json`

```bash
mkdir -p server/data/photos
```

### 3. Container

Needs Docker Engine + Compose plugin.

```bash
chmod +x deploy.sh
./deploy.sh
```

That script: `git pull --ff-only`, `docker compose build`, `up -d`, wait until `/healthz` is healthy.

Manual equivalent:

```bash
docker compose --env-file .env -f docker-compose.yml build
docker compose --env-file .env -f docker-compose.yml up -d --remove-orphans
curl -sS http://127.0.0.1:3010/healthz
```

Data volume: `./server/data` → `/app/server/data` in the container. Rebuilds do not wipe accounts.

### 4. Nginx

HTTP-only file so Certbot can add TLS (same pattern as finsense / prasikshan):

```bash
sudo cp nginx/games /etc/nginx/sites-available/games
sudo ln -sf /etc/nginx/sites-available/games /etc/nginx/sites-enabled/games
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d games.zakarias.in -d www.games.zakarias.in
```

The vhost proxies `/` and `/socket.io/` to `127.0.0.1:3010` with WebSocket upgrade. `/sw.js` is **no-cache** so PWA updates land. Vite hashed files under `/assets/` are cached.

### 5. Smoke after deploy

- `https://games.zakarias.in/healthz` → `{"ok":true}`
- Request access → staff `/errorPagesBro` → mail arrives with signup link
- Sign up, enable chimes on profile, send a trial chime
- Open a table, invite from People, deal a game, Socket.IO stays up (no 502 on refresh during play)

### Updates

```bash
cd /home/alok-aman/games/CardGames
./deploy.sh
```

### Logs

```bash
docker compose --env-file .env logs -f --tail 100 baithak
```

---

## PWA

- Manifest: `client/public/manifest.webmanifest` (standalone, theme `#0e3b34`)
- Icons: `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `logo.png`
- Service worker: `client/public/sw.js` — cache static shell, never `/api` or `/socket.io` or `/photos`; push + `notificationclick` + `pushsubscriptionchange`
- **Phone install:** visiting on a phone opens a sheet to add Baithak to the home screen. Android Chrome uses the native install prompt; iPhone shows Share → Add to Home Screen. After dismiss, a brass **Add to home screen** pill stays until the parlor is opened as a standalone app. Hidden during play.
- **Table chimes:** same Enable toggle as Whip — user-gesture only, on Profile and as a follow-up sheet after install / login. iPhone chimes only work from the home-screen icon. Login re-binds an existing subscription; logout unbinds the server row and keeps the browser permission.

---

## What this is not

- Not a database. Back up `server/data/` if accounts matter.
- Not three repos. Do not split frontend/backend for this parlor.
- Tokens and live tables vanish on container restart; **refresh tokens and users do not**, if the volume is intact. The client will mint a new access token automatically.
- Do not bind host `3001` — FinSense is already there.

---

## License / origin

Game rules documented under `*/gameInfo.md`. Cabo here is the folk/PyCon variant (not Eventide’s commercial Cabo).
