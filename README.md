# deriv-last-digit

Small Node.js utility that connects to Deriv's public WebSocket API and emits the "last digit" of the latest tick for each volatility index every 15 seconds.

Important notes
- This tool only fetches market tick values and extracts the last digit of the numeric quote. It does not provide predictions or trading strategies.
- Use responsibly. Respect Deriv's terms of service, rate limits, and rules about automated access.

Quick start

1. Install dependencies

```bash
cd ~/Desktop/deriv-last-digit
npm install
```

2. Run

```bash
npm start
```

Configuration
- Use `DERIV_APP_ID` or `DERIV_WS_URL` environment variables to change the WebSocket endpoint/app_id.
- If the automatic active-symbols request does not return volatility indices in your region, set `SYMBOLS` env to a comma-separated list (e.g. `R_100,R_50`):

```bash
SYMBOLS="R_100,R_50" npm start
```

Environment variables
---------------------

This project reads configuration from environment variables. You can create a local `.env` file in the project root (this file is already listed in `.gitignore` so it won't be committed). The following variables are recognized by the script:

- `DERIV_APP_NAME` - your registered Deriv app name (example: `PURP_MATCH_31`).
- `DERIV_APP_ID` - your registered Deriv app id (example: `110873`).
- `DERIV_WS_URL` - full WebSocket URL to use instead of the default (optional). If set, it overrides `DERIV_APP_ID` when constructing the default URL.
- `DEMO_ACCOUNT_ID` - your demo Deriv account ID (optional; used by client code that needs an account id).
- `DEMO_TOKEN` - API token for your demo account (optional).
- `REAL_ACCOUNT_ID` - your real Deriv account ID (optional).
- `REAL_TOKEN` - API token for your real account (optional).
- `SYMBOLS` - optional comma-separated list of symbols to subscribe to (e.g. `R_100,R_50`). Used if the active_symbols request doesn't return volatility indices for your region.

Startup requirement
-------------------

This tool now requires a `DEMO_TOKEN` to be present in your environment at startup (for safety and to enable any authenticated API calls). Place it in a local `.env` file (ignored by git) as shown in the example, or export it in your shell before starting the tool.

Security recommendation
-----------------------

For safety, do not store real account tokens in your project's local `.env`. The local `.env` that comes with this repository intentionally omits the real token. If you must use a real token, supply it via environment variables at runtime (for example: `REAL_TOKEN=... npm start`) and never commit it to the repo.

Security note
-------------

Keep your tokens secret. Do not commit your `.env` file to version control. `.env` is already listed in `.gitignore` in this project. For sharing or public repositories, use `.env.example` (which contains placeholders) instead of real secrets.

Example `.env` (local, DO NOT COMMIT) — this file may contain real values and is ignored by git:

```
# Deriv app details
DERIV_APP_NAME=PURP_MATCH_31
DERIV_APP_ID=110873

# Optional: override full WebSocket URL
# DERIV_WS_URL=wss://ws.binaryws.com/websockets/v3?app_id=110873

# Optional account tokens (use only if your workflow requires them)
DEMO_ACCOUNT_ID=VRTC8609011
DEMO_TOKEN=NSNQ9DWt0jbqaby
REAL_ACCOUNT_ID=CR5865343
REAL_TOKEN=wQw5foftZG4lAzm

# Optional symbols
# SYMBOLS=R_100,R_50
```

Behavior
- The script will request active volatility indices from the API, subscribe to ticks for each, and every 15 seconds print a list of symbols with their latest last-digit value.

Security & ethics
- Do not use this tool to automate betting or circumvent platform safeguards. Ensure you comply with all platform rules and local laws.

Troubleshooting
- If the script exits complaining about no symbols, provide the `SYMBOLS` env variable.
- If you see connection errors, check network connectivity or whether your environment blocks WebSocket connections.

Web UI, simulation and admin API
--------------------------------

I added a simple web UI and control features:

- Visit http://localhost:3000 to see per-symbol cards with a 15s countdown and a signal display (default show duration 7s). The UI shows a progress bar for each symbol.
- Use the "Simulate" checkbox on the page to enable simulation mode: the server will generate synthetic ticks and occasional simulated errors for UI testing.
- Admin HTTP endpoints (local only):
	- GET /admin/stop — stop all per-symbol cycles
	- GET /admin/start — start cycles for currently subscribed symbols
	- GET /admin/reload — request the Deriv API to refresh active symbols (requires the app to be connected)

Production deployment (Render)
-----------------------------

To deploy the full app (backend + frontend) to Render and get a stable https URL, follow these steps:

1. Create a Git repository and push your code (run locally in the project root):

```bash
git init
git add .
git commit -m "Initial: deriv-last-digit app + web UI"
# create a repo on GitHub and add remote, then:
git remote add origin git@github.com:<your-username>/deriv-last-digit.git
git push -u origin main
```

2. In Render (https://render.com) create a new "Web Service" and connect your GitHub repo.

3. Set environment variables in the Render service settings (do NOT commit these to git):
- `DEMO_TOKEN` (required for startup)
- `DERIV_APP_ID` (example: `110873`)
- `DERIV_APP_NAME` (example: `PURP_MATCH_31`)
- `ADMIN_TOKEN` (recommended) — when set, admin endpoints require this token in the `x-admin-token` header
- `SYMBOLS` (optional)
- `DISPLAY_DURATION_MS` (optional)
- `ENABLE_TUNNEL` (optional; not needed on Render)

4. Build & Start
- Build command: (leave empty) or `npm install` (Render runs install automatically)
- Start command: `npm start`

Render will build and deploy your app and give you a public URL (https). Check `logs/server.log` or Render's logs for startup messages.

Security note: admin endpoints are protected by `ADMIN_TOKEN` when set; make sure to set `ADMIN_TOKEN` in Render. Avoid putting real account tokens in your Render environment unless absolutely necessary.

Logs
----

Server logs are written to `logs/server.log`. You can view recent lines at:

http://localhost:3000/logs

Tunneling
---------

To expose the UI publicly (optional), install `localtunnel` and start the server with `ENABLE_TUNNEL=true`:

ENABLE_TUNNEL=true npm start

The public URL will be logged into `logs/server.log` when the tunnel starts.
