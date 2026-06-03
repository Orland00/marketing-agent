# Marketing Agent

**AI-powered, multi-tenant social media automation on a single Cloudflare Worker.**
Generate on-brand posts with Claude, review and approve them from Telegram, and
publish on a schedule to Meta (Facebook / Instagram) and X.

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-Hono-F38020?logo=cloudflare&logoColor=white)
![Anthropic](https://img.shields.io/badge/Claude-Anthropic_SDK-D97757)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?logo=supabase&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)

> Public, sanitized snapshot. All real brand data, credentials, and account IDs
> have been removed; tenants are reduced to generic demo brands (`demo`, `acme`,
> `globex`). Not configured to connect to any live account.

## How it works

```
        Claude (content)            Telegram (human approval)
              │                              │
              ▼                              ▼
   ┌──────────────────────────────────────────────────┐
   │            Cloudflare Worker (Hono)                │
   │  generate → queue → approve → schedule → publish   │
   └──────────────────────────────────────────────────┘
              │                              │
              ▼                              ▼
        Supabase (state)         Meta Graph API / X API
```

1. **Generate.** Per-tenant brand voice, audience, and hashtags drive a Claude
   prompt that drafts platform-specific copy (`src/lib/ai.ts`).
2. **Approve.** Drafts land in a queue; an operator approves, edits, or rejects
   them from a Telegram chat (`src/telegram/handler.ts`, `src/routes/accept-ui.ts`).
3. **Schedule & publish.** A cron-driven publish queue posts approved content via
   platform adapters (`src/adapters/meta.ts`, `src/adapters/twitter.ts`).
4. **Measure.** Engagement stats are pulled back daily for reporting
   (`src/routes/analytics.ts`, `src/routes/stats-ui.ts`).

## Highlights

- **Multi-tenant by slug.** One Worker serves many brands via `/:slug` routes;
  brand config lives in `src/lib/product.ts`.
- **AI operations layer** with prompt registry, public eval shells, and a
  human-in-the-loop approval model (`docs/ai/`).
- **Database-backed workflow** for tenants, prompts, drafts, queues, approvals,
  schedules, publish results, and analytics snapshots.
- **External API adapters** for model providers, Telegram, Meta Graph, X, object
  storage, and Supabase.
- **Queue-first production shape**: generation, review, publishing, retry, and
  reporting are separated into explicit states.
- **Adapter pattern** isolates each social platform behind a common interface.
- **Human-in-the-loop publishing** — nothing goes out without approval.
- **Cron dispatcher** for the publish queue and daily analytics pulls.
- **R2-backed image handling** for generated post media.

## Layout

```
src/
  adapters/   per-platform publishers (meta, twitter) + registry
  lib/        ai, publisher, supabase, telegram, validation, date-parser
  routes/     posts, campaigns, pending, accept/stats UIs, analytics, images
  telegram/   bot command + approval handler
tests/        vitest unit tests
docs/        public architecture + AI operations shell
```

See [`docs/architecture.md`](./docs/architecture.md) for the sanitized database,
API, queue, and provider integration map.

## Running locally

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in your own keys
npm run dev
npm test
```

Secrets are set with `wrangler secret put` in production and never committed.
See `.dev.vars.example` for the full list.

## License

Source-available for portfolio / review purposes. Not licensed for
redistribution or commercial reuse.
