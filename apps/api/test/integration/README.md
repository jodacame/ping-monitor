# Integration tests

These run against a **live API**, unlike the unit tests, which need nothing.
They are skipped automatically unless `PING_E2E_BASE` is set, so `pnpm test`
stays fast and infrastructure-free.

They exist because the bugs they catch are invisible to unit tests: a documented
endpoint returning 500, a security control that silently stops applying, a
response shape drifting away from the documentation.

## Running them

Point them at any instance with a known account:

```bash
PING_E2E_BASE=http://localhost:3000/api \
PING_E2E_EMAIL=demo@example.com \
PING_E2E_PASSWORD=supersecret \
pnpm test
```

Against the Compose stack:

```bash
docker compose up -d
docker compose exec api sh -c 'pnpm --filter @ping/api run seed'
PING_E2E_BASE=http://localhost:8080/api pnpm test
```

> They create monitors, channels, tags, groups, status pages and API keys, and
> they trip the login rate limiter on purpose. **Use a test instance, never
> production data.**

## What each file covers

| File | Covers |
|---|---|
| `security.test.ts` | Authentication, scopes, tenant isolation, IP allowlist spoofing, rate limiting, secret redaction |
| `docs-conformance.test.ts` | Every factual claim the documentation makes, asserted against the running API |
