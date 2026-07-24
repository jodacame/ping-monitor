# Developer API

Ping Monitor exposes a REST API and a real-time WebSocket. Both are authenticated
with a **workspace-scoped API key** (create one under *Developers* in the app).

Base URL: `https://<your-host>/api`

## Authentication

Send the key as a bearer token:

```
Authorization: Bearer pk_xxxxxxxxxxxxxxxxxxxxxxxx
```

An API key can access every workspace-scoped endpoint of the workspace it belongs
to. Managing keys themselves (creating/revoking) requires a signed-in user, not a
key.

## REST — common endpoints

All are under `/workspaces/:workspaceId`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/monitors` | List monitors (`?status=`, `?search=`, `?tagId=`, `?page=`, `?pageSize=`) |
| POST | `/monitors` | Create a monitor |
| GET | `/monitors/:id` | Monitor detail |
| PATCH | `/monitors/:id` | Update a monitor |
| DELETE | `/monitors/:id` | Delete a monitor |
| POST | `/monitors/:id/pause` · `/resume` | Pause / resume |
| GET | `/monitors/:id/stats?window=24h|7d|30d` | Uptime + latency series |
| GET | `/monitors/:id/checks` · `/incidents` | Recent checks / incidents |
| GET | `/monitors/:id/export.csv` | Check history as CSV |
| GET | `/overview` · `/insights` | Workspace status counts / 24h insights |
| GET/POST/DELETE | `/channels`, `/groups`, `/tags`, `/status-pages` | Manage those resources |

Example:

```bash
curl https://your-host/api/workspaces/WORKSPACE_ID/monitors \
  -H "Authorization: Bearer pk_xxx"
```

Errors use `{ "error": { "code", "message", "details?" } }` with a matching HTTP
status.

## WebSocket — real-time events

Connect to receive status changes the instant they happen (no polling):

```
wss://<your-host>/api/ws?apiKey=pk_xxx
```

```js
const ws = new WebSocket("wss://your-host/api/ws?apiKey=pk_xxx");
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === "monitor.status_changed") {
    // { monitorId, workspaceId, monitorName, from, to, at, responseMs, error? }
    console.log(`${msg.monitorName}: ${msg.from} → ${msg.to}`);
  }
};
```

On connect you receive `{ "type": "connected", "workspaceId": "…" }`. You then
only receive events for that workspace. The stream is fan-out and efficient: one
server-side reader broadcasts to all connected clients.

## Public status page

Read-only, no auth: `GET /api/public/status/:slug`.
