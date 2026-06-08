# Messenger Bot (Madox)

A Facebook Messenger group bot powered by `@neoaz07/nkxfca`, with a full web dashboard for managing the bot, groups, commands, and session.

## Run & Operate

- `PORT=3001 pnpm --filter @workspace/messenger-bot run dev` — run the bot + dashboard (port 3001)
- Bot dashboard available at the root preview URL

## First-Time Setup

1. **Provide a valid Facebook session (appstate.json)**:
   - Open the dashboard → 🍪 الجلسة tab
   - Upload your `appstate.json` file (exported from your Facebook session)
   - The bot will reconnect automatically after a few seconds

2. **Set a strong Dashboard API key**:
   - Edit `artifacts/messenger-bot/config.json` → `dashboard.apiKey`
   - Or set env var `DASHBOARD_API_KEY`

3. **Configure bot admin ID**:
   - Edit `artifacts/messenger-bot/config.json` → `bot.adminIDs`
   - Add your Facebook user ID

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Bot: `@neoaz07/nkxfca` (Facebook Messenger API)
- Dashboard: Express 4 + vanilla JS (RTL Arabic UI)
- Canvas rendering: `@napi-rs/canvas`

## Where things live

- `artifacts/messenger-bot/` — all bot source code (unchanged from original)
- `artifacts/messenger-bot/commands/` — 36 bot commands
- `artifacts/messenger-bot/dashboard/` — web dashboard (HTML/CSS/JS)
- `artifacts/messenger-bot/utils/` — helper utilities
- `artifacts/messenger-bot/config.json` — main configuration
- `artifacts/messenger-bot/appstate.json` — Facebook session cookies

## Architecture decisions

- Files are copied verbatim from the original project with zero changes
- Bot serves its dashboard via Express on PORT env var (default 3001)
- Uses SSE (Server-Sent Events) for live activity streaming to the dashboard
- Appstate auto-saves every 15 minutes; human simulator runs to avoid detection

## Product

Full-featured Facebook Messenger group management bot with dashboard:
- 36 commands (kick, ban, mute, lock, nickname, poll, music, etc.)
- Web dashboard with Arabic RTL UI
- Group management, broadcast, auto-reply
- Human simulator (presence, typing, read receipts)
- Cookie/session management
- Security (anti-spam, allowlist, bans)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `appstate.json` must contain valid, non-expired Facebook session cookies
- Dashboard API key defaults to `changeme-set-a-strong-secret` — change it before exposing publicly
- `@napi-rs/canvas` requires native bindings; sqlite3 build script must be approved via `pnpm approve-builds`
- The bot retries login with exponential backoff; normal to see login errors on startup with stale cookies
