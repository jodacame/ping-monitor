# Contributing

Thanks for your interest in improving Ping Monitor! This project aims for
production-grade, senior-level code — clear, tested and documented.

## Getting set up

Requires Node 26 and pnpm, plus a PostgreSQL and Redis you can reach.

```bash
pnpm install
cp .env.example .env      # point DATABASE_URL / REDIS_URL at your services
pnpm --filter @ping/db run migrate
```

Run the pieces you need with `pnpm dev:api`, `dev:scheduler`, `dev:worker`,
`dev:web`.

## Before opening a PR

Please make sure all gates pass:

```bash
pnpm typecheck
pnpm test
pnpm lint
```

## Guidelines

- **Keep the layering.** Pure domain logic goes in `@ping/core` (no I/O).
  Persistence goes through repositories. New probe types implement
  `CheckExecutor` and register in `@ping/checks`.
- **Migrations are immutable.** Never edit an applied migration; add a new
  numbered `.sql` file. The runner verifies checksums.
- **Never commit secrets.** `.env` is git-ignored; update `.env.example` with
  placeholders when adding configuration.
- **Write tests** for domain logic and non-trivial behaviour (Vitest).
- **English** for all code, identifiers and comments. UI copy stays simple and
  friendly.

## Commit messages

Conventional, imperative summaries (e.g. `feat: add TCP check executor`,
`fix: correct rollup bucket timezone`). Keep unrelated changes in separate PRs.
