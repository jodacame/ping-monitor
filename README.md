<h1 align="center">🛰️ Ping Monitor</h1>

<p align="center">
  <b>Self-hosted, open-source uptime monitoring.</b><br/>
  Monitor websites, APIs and servers with HTTP / TCP / ICMP checks, SSL & JSON
  health assertions, multi-channel alerts, public status pages, and a real-time API —
  built to scale from one site to millions on plain PostgreSQL, Redis and Node.js.
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-3fb950.svg"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white">
  <img alt="Node" src="https://img.shields.io/badge/Node-26-339933?logo=nodedotjs&logoColor=white">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-native%20partitioning-4169e1?logo=postgresql&logoColor=white">
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-compose-2496ed?logo=docker&logoColor=white">
  <img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-6366f1.svg">
</p>

<p align="center">
  <img src="docs/images/dashboard.png" alt="Ping Monitor dashboard — monitors grouped, live status, uptime and latency" width="900">
</p>

> A modern, open-source alternative for **website monitoring**, **server monitoring**
> and **status pages** — think Uptime Kuma / Better Uptime, self-hosted and yours.

---

## ✨ Features

- **Monitor types** — **HTTP/HTTPS**, **TCP** port, and **ICMP ping**.
- **Deep health checks** — assert on status code, response time, headers, plain body,
  or a **JSON path** value, combined with **AND/OR** groups. Optional **SSL
  certificate-expiry** alerts and body keyword checks.
- **Anti-false-positive** — a monitor flips only after N consecutive failures
  (per region), and recovers after M successes.
- **Global monitoring** — deploy probe workers in multiple regions; overall status
  is decided by **quorum** (down only when *K* regions agree).
- **Alerts, per monitor** — pick which channels each monitor uses: **Email (SMTP)**,
  **Telegram**, or a **generic Webhook** (custom method, headers, auth, and a
  `{{variable}}` body template for any API).
- **Public status pages** — publish a branded page at `/status/:slug` (no auth).
- **Groups, tags & filters** — organise and slice your monitors.
- **Statistics & charts** — uptime, latency and incident history over 24h / 7d / 30d,
  plus **CSV export**.
- **Developer API** — a **REST API** and a **real-time WebSocket** for status-change
  events, secured with scoped, expiring, IP-restricted **API keys**, rate limiting
  and security headers. See [`docs/API.md`](docs/API.md).
- **Beautiful UI** — React + Vite, light/dark, fully responsive, dedicated pages
  with real URLs.

## 📸 Screenshots

|  |  |
|--|--|
| **Monitor detail** — charts, checks, incidents | **Public status page** |
| <img src="docs/images/monitor-detail.png" alt="Monitor detail with latency chart"> | <img src="docs/images/status-page.png" alt="Public status page"> |
| **Developer API & keys** | **Light theme** |
| <img src="docs/images/developers.png" alt="Developer API keys and docs"> | <img src="docs/images/dashboard-light.png" alt="Dashboard light theme"> |

<p align="center"><img src="docs/images/mobile.png" alt="Mobile dashboard" width="300"></p>

## 🚀 Quick start (Docker)

Requirements: Docker + Docker Compose.

```bash
git clone https://github.com/jodacame/ping-monitor.git
cd ping-monitor
cp .env.example .env
# edit .env: set a strong JWT_SECRET  →  openssl rand -base64 48

docker compose up -d --build
# open the dashboard:  http://localhost:8080
```

Scale the probe workers horizontally:

```bash
docker compose up -d --scale worker=3
```

The bundle runs its own PostgreSQL and Redis. For **multi-region** monitoring,
deploy extra `worker` containers on hosts in other regions (each with a distinct
`PROBE_REGION`), all pointing at the same Postgres and Redis — see the
[multi-region deployment guide](docs/ARCHITECTURE.md#multi-region-deployment).

## 🧭 Architecture

```
                        ┌───────────────┐
      REST / SPA / WS ──▶     API       │  auth · monitors · stats · API keys · WS
                        └──────┬────────┘
                               │ Postgres
      ┌───────────────┐        ▼
      │   Scheduler   │──▶ claims due (monitor, region) checks  (FOR UPDATE SKIP LOCKED)
      └──────┬────────┘        │
        Redis Stream  ┌────────▼─────────┐   Postgres
   checks:pending:R ──▶     Worker(s)    │──▶ check_results (day-partitioned)
                        │  region = R    │──▶ hourly / daily rollups · incidents
                        └──────┬─────────┘──▶ publish
                               │ events:monitor ─▶ Notifier (alerts) · WebSocket (live)
```

A pnpm monorepo, TypeScript end-to-end, SOLID and event-driven. The hot
`check_results` table is **range-partitioned by day** (vanilla PostgreSQL, no
extensions) with pre-aggregated rollups. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

**Packages:** `core` (domain + retry state machine), `config`, `db`, `queue`
(Redis Streams), `checks`, `notifications`.
**Apps:** `api`, `scheduler`, `worker`, `notifier`, `web`.

## 🛠️ Development

Runs on Node 26 with **pnpm**.

```bash
pnpm install
pnpm --filter @ping/db run migrate    # apply schema
pnpm seed                             # optional: example monitors (HTTP/TCP/ICMP,
                                      #           simple + complex health checks)
pnpm dev:api                          # API      (:3000)
pnpm dev:scheduler                    # scheduler
pnpm dev:worker                       # worker
pnpm dev:notifier                     # alert dispatcher
pnpm dev:web                          # dashboard (:5173)
```

Quality gates: `pnpm typecheck` · `pnpm test` (Vitest) · `pnpm lint`.

## 🔑 Accounts & recovery

- **First account (onboarding):** a fresh instance has no users. Open the app and
  the setup screen lets you create the initial **owner** account — always allowed,
  even with registration closed.
- **Registration:** self-service sign-up is **off by default**
  (`ALLOW_REGISTRATION=false`); only the first account is allowed. Set
  `ALLOW_REGISTRATION=true` to open public sign-up.
- **Forgot a password?** There is no email reset yet; recover from the server with
  the built-in admin CLI (no SMTP needed). It generates a strong password when you
  omit one, and signs out all of that user's sessions:

  ```bash
  # prints a freshly generated password
  docker compose run --rm api pnpm --filter @ping/api run reset-password you@example.com

  # or set a specific one (min 8 chars)
  docker compose run --rm api pnpm --filter @ping/api run reset-password you@example.com 'NewPass123'
  ```

## 🔌 API & real-time events

Authenticate the REST API and WebSocket with a workspace-scoped API key created
under **Developers** in the app.

```bash
curl https://your-host/api/workspaces/WORKSPACE_ID/monitors \
  -H "Authorization: Bearer pk_xxx"
```

```js
const ws = new WebSocket("wss://your-host/api/ws", ["pk_xxx"]);
ws.onmessage = (e) => console.log(JSON.parse(e.data)); // monitor.status_changed
```

Full reference: [`docs/API.md`](docs/API.md).

## 🗺️ Roadmap

- [x] HTTP / TCP / ICMP monitors · SSL expiry · health assertions (AND/OR)
- [x] Alerts (Email, Telegram, Webhook), per monitor · groups · tags · CSV export
- [x] Public status pages · developer API keys · real-time WebSocket
- [ ] Per-region latency/uptime breakdown in the UI
- [ ] Two-factor auth · audit log · ephemeral WebSocket tickets

## 🤝 Contributing

Contributions are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## 📄 License

[MIT](LICENSE) © [jodacame](https://github.com/jodacame) and Ping Monitor contributors.

---

## Build record — human + AI

This project is kept as a **transparent record of what it looks like to build a
production-grade tool with AI in 2026**: a developer directing and reviewing, and
an AI pair doing the heavy lifting. The numbers below are published for research,
tracking and posterity — a small time capsule of the cost and pace of this way of
working. They come straight from the Claude Code session report (API list pricing),
not marketing estimates.

<table>
  <tr><td><b>&gt; Model</b></td><td>Claude <b>Opus 4.8</b> (1M context) — Anthropic</td></tr>
  <tr><td><b>&gt; Direction &amp; review</b></td><td>Human-in-the-loop (design, decisions, QA, sign-off)</td></tr>
  <tr><td><b>&gt; Session</b></td><td>July 2026</td></tr>
  <tr><td><b>&gt; Time</b></td><td>~4h 11m wall · 3h 11m API</td></tr>
  <tr><td><b>&gt; Code changes</b></td><td>+16,940 / −718 lines</td></tr>
  <tr><td><b>&gt; Tokens</b></td><td>~809K generated · ~365M processed (mostly cached context)</td></tr>
  <tr><td><b>&gt; AI cost</b></td><td><b>$212.64 USD</b> (Anthropic API list pricing)</td></tr>
  <tr><td><b>&gt; Cost / net line</b></td><td>≈ $0.013</td></tr>
</table>

> A full monorepo — API, scheduler, worker, notifier and web dashboard, plus
> migrations, tests and docs — designed, built and reviewed in a single afternoon.
> Not to replace engineers, but to show how far a senior developer and a capable
> model can go together, and to leave an honest data point for whoever looks back.

<p align="center">
  🤖🧑‍🚀 <b>Friendly note:</b> built by an AI and a human keeping an eye on it (mostly
  saying "yes, ship it"). Started as a personal project, but it's free and open — so
  if it saves your bacon at 3&nbsp;a.m. when prod goes down, it's yours. No warranties,
  just good vibes and a decent test suite. Use it, fork it, break it, make it better. 🛰️💚
</p>

<p align="center"><sub>Keywords: uptime monitoring · status page · website monitoring · server monitoring · HTTP/TCP/ICMP/ping monitor · SSL monitoring · self-hosted · open source · Docker · PostgreSQL · TypeScript · React · Uptime Kuma alternative</sub></p>
