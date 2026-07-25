# Developer API

Ping Monitor exposes a REST API and a real-time WebSocket.

**The complete endpoint reference lives in your own instance:**

| | |
|---|---|
| Interactive docs | `https://<your-host>/api/docs` |
| OpenAPI document | `https://<your-host>/api/openapi.json` |

That reference is generated from the same validation schemas the server enforces,
and a test fails the build if a route is missing from it — so it cannot drift out
of date. This page covers the things a generated reference cannot explain well:
how authentication and workspaces fit together, and how to use the WebSocket.

Base URL: `https://<your-host>/api`

---

## Authentication

Two kinds of bearer token are accepted, in the same header:

```
Authorization: Bearer <token>
```

| | **API key** | **User access token** |
|---|---|---|
| Looks like | `pk_…` | a JWT |
| Belongs to | one workspace | a person |
| Created by | *Developers* screen, or `POST /workspaces/{workspaceId}/api-keys` | `POST /auth/login` |
| Use it for | scripts, integrations, dashboards | acting as a user |
| Lifetime | until revoked or expired | short; renew with `POST /auth/refresh` |

An API key works on every endpoint of **its own** workspace. Inside that
workspace it has **admin-level access** — a `write` key can delete monitors,
channels and status pages — so treat it as a privileged credential.

A key is **rejected with `403`** on endpoints that act on a person or span
workspaces: `/auth/me`, `/auth/change-password`, `/workspaces`, and the API-key
endpoints themselves. Those need a user token.

### Scopes

A key holds `read`, `write`, or both. A read-only key may only use `GET`, `HEAD`
and `OPTIONS`; anything else returns `403`.

### Expiry and IP allowlist

A key can be given an expiry and a list of allowed IPs or CIDR blocks (IPv4 and
IPv6). A key that is expired, revoked or calling from a disallowed address
returns the same `401` — the message never says which, so a key cannot be probed.

> **The IP allowlist depends on `TRUST_PROXY` being correct.** The client IP is
> derived from `X-Forwarded-For`, so the server must know how many proxies sit in
> front of it. The bundled Compose stack sets `TRUST_PROXY=1` (nginx). Add one
> for every extra proxy — a Cloudflare Tunnel in front of nginx means `2`. Set it
> too high and callers can forge their own IP, defeating both the allowlist and
> rate limiting.

---

## Workspaces

Every resource belongs to a workspace, so almost every path starts with
`/workspaces/{workspaceId}`. The id is the workspace's **public id**, not its
slug or name.

### If you were handed an API key

An integration usually receives a key and nothing else. Ask the API who you are:

```bash
curl -s https://your-host/api/auth/whoami -H "Authorization: Bearer pk_xxx"
# -> { "principal": "api_key", "workspaceId": "01J…", "scopes": ["read"], "expiresAt": null }
```

That is the supported way to discover the workspace id a key belongs to. The
same endpoint works with a user token and then returns the user and their
workspaces, so a client can handle both credential types with one call.

### Getting your first workspace id

```bash
# 1. Sign in
curl -s https://your-host/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}'
# -> { "accessToken": "...", "refreshToken": "...", "user": { ... } }

# 2. List your workspaces (needs the user token, not a key)
curl -s https://your-host/api/workspaces \
  -H "Authorization: Bearer $ACCESS_TOKEN"
# -> [ { "id": "01J…", "name": "My Workspace", "slug": "my-workspace-ab12", "role": "owner" } ]

# 3. Mint an API key for that workspace
curl -s https://your-host/api/workspaces/$WORKSPACE_ID/api-keys \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"my-integration","scopes":["read","write"]}'
# -> { "id": "…", "prefix": "pk_AbCdEfGh…", "key": "pk_…" }   <-- "key" is shown ONCE
```

`GET /auth/me` returns the same workspace list alongside the user, if you need
both in one call.

### Using the wrong workspace

A key presented against a workspace that is not its own returns `403` with
`"This API key is not valid for this workspace"` — including for workspace ids
that do not exist, so the API cannot be used to discover them.

### Roles

`GET /workspaces` reports a `role` of `owner`, `admin`, `member` or `viewer`.
**Roles are informational today: no endpoint restricts anything by role**, so
every member has full access to the workspace. Do not rely on them as a
permission boundary yet.

---

## Requests and responses

Send and receive JSON. Bodies are capped at 256 KiB.

Errors always use the same envelope:

```json
{ "error": { "code": "validation_error", "message": "Request validation failed",
             "details": [ { "path": "intervalSeconds", "message": "Interval must be one of: 30, 60, 300, 900 seconds" } ] } }
```

| `code` | HTTP |
|---|---|
| `validation_error` | 400 |
| `unauthorized` | 401 |
| `forbidden` | 403 |
| `not_found` | 404 |
| `conflict` | 409 |
| `rate_limited` | 429 |
| `internal_error` | 500 |

`details` is present on validation failures and names the offending fields.

### Two things worth knowing before you create a monitor

- **`intervalSeconds` accepts only `30`, `60`, `300` or `900`.** Anything else is
  a `400`.
- **Listing and fetching a monitor return slightly different objects.** The list
  adds display data (`uptime24h`, `bars`); the detail adds `regionIds`. Fetch the
  detail endpoint when you need to know a monitor's regions.

### Multi-region

`regionIds` pins a monitor to specific probe regions (ids come from
`GET /regions`), and `quorum` sets how many of them must agree before the status
flips. Leave `regionIds` empty to use the default region. See
[ARCHITECTURE.md](./ARCHITECTURE.md#multi-region-deployment) for the deployment
side.

### Notification channel secrets

Channel configs come back with secrets masked as `••••••` — passwords, tokens,
and the sensitive tail of a webhook URL (for Slack and Discord the URL *is* the
credential). If you send a masked value back unchanged on `PATCH`, the stored
secret is kept, so reading a channel and writing it back never destroys it.

---

## Rate limiting

**300 requests per minute** by default, and **10 per minute** on credential
endpoints (`/auth/login`, `/auth/register`, `/auth/change-password`).

Requests are counted **per API key** when one is presented, otherwise per client
IP — so one key's traffic never eats another's budget, even from the same host.

Every response carries the current state:

| Header | Meaning |
|---|---|
| `x-ratelimit-limit` | Requests allowed in the current window |
| `x-ratelimit-remaining` | Requests left in the window |
| `x-ratelimit-reset` | Seconds until the window resets |
| `retry-after` | Seconds to wait — **sent only on a `429`** |

```
x-ratelimit-limit: 300
x-ratelimit-remaining: 297
x-ratelimit-reset: 60
```

A well-behaved client watches `x-ratelimit-remaining` and backs off before it
hits zero; on a `429` it waits `retry-after` seconds. Counters are shared across
API replicas (Redis), and if Redis is unreachable the limiter fails open rather
than blocking traffic.

---

## Real-time events (WebSocket)

Connect to `/api/ws` to receive status changes the moment they happen, with no
polling.

**An API key is required — a user access token is rejected.** Send it as a
WebSocket **subprotocol**, together with the `ping-monitor-v1` sentinel:

```js
const ws = new WebSocket("wss://your-host/api/ws", ["ping-monitor-v1", "pk_your_key"]);

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  switch (msg.type) {
    case "connected":
      console.log("streaming events for workspace", msg.workspaceId);
      break;
    case "monitor.status_changed":
      console.log(`${msg.monitorName}: ${msg.from} → ${msg.to} (${msg.responseMs} ms)`);
      break;
    case "error":
      console.error("rejected:", msg.message); // the socket closes right after
      break;
  }
};
```

**Send the sentinel.** A WebSocket server may only select a protocol the client
offered, so when the key is the *only* thing offered the server has to echo it
back — putting the key in the `Sec-WebSocket-Protocol` **response** header,
where devtools and any proxy logging response headers can see it. Offer the
sentinel and the server negotiates that instead, and the key is never echoed.

The `?apiKey=pk_…` query parameter is also accepted, but it puts the credential
in a URL, where proxies and browser history keep it. Prefer the subprotocol.

### Frames

Every frame is JSON with a `type`. Always branch on it: the handshake and errors
arrive on the same socket as the events.

| `type` | When | Payload |
|---|---|---|
| `connected` | once, immediately after a successful connection | `workspaceId` |
| `error` | authentication failed, or the connection cap was reached — **the socket closes right after** | `message` |
| `monitor.status_changed` | a monitor's status changed | see below |

```json
{
  "type": "monitor.status_changed",
  "monitorId": "01J…",
  "workspaceId": "01J…",
  "monitorName": "API — production",
  "from": "up",
  "to": "down",
  "at": "2026-07-25T14:03:11.412Z",
  "responseMs": 1840,
  "error": { "kind": "timeout", "message": "Timed out after 10000 ms" }
}
```

- `monitorId` is the stable key back to the REST API — match on it, not on
  `monitorName`, which users can rename.
- `from` and `to` are `pending`, `up`, `down` or `paused`. A brand-new monitor's
  first event is usually `pending → up`, not a failure.
- `error` is present only on a transition into `down`.
- `monitor.status_changed` is the only event type today.

### Operational limits

- You only ever receive events for the key's own workspace.
- **50 concurrent connections per workspace, per API process.** Exceeding it
  yields an `error` frame and a close. Running several API replicas multiplies
  the effective limit.
- The server sends a WebSocket ping every 30 seconds and drops sockets that stop
  answering. Reconnect with backoff; you have not missed state, since
  `GET /workspaces/{id}/monitors` always returns the current truth.
- Events are broadcast live and are **not** replayed. A client that reconnects
  should re-read current state rather than expect a backlog.
- **Revoking a key closes open sockets too.** A connection re-checks its key
  every minute and is dropped once the key is revoked or expires, so a rotated
  credential stops streaming within about a minute without restarting anything.

---

## Public status page

`GET /api/public/status/{slug}` needs no authentication and returns only display
data — no ids, no configuration. Slugs are unique across the whole instance.
