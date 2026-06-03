# Architecture Shell

This public snapshot keeps the integration shape visible while removing private
tenant data, credentials, account IDs, and live endpoints.

## Runtime Components

| Area | Shell |
|------|-------|
| Edge API | Cloudflare Worker + Hono routes |
| Database | Supabase Postgres for tenants, drafts, queues, templates, analytics |
| Storage | Object storage for generated or uploaded campaign media |
| AI provider | Model boundary for draft generation, rewrites, summaries, and briefs |
| Messaging | Telegram operator commands and approval callbacks |
| Social APIs | Meta Graph and X publisher adapters |
| Scheduler | Cron-driven queue processing and analytics sync |

## Data Flow

1. Tenant config is read from Postgres.
2. AI drafts are generated from approved context.
3. Drafts are inserted into the review queue.
4. Operators approve, edit, reject, or regenerate.
5. Approved posts enter a scheduled publish queue.
6. Platform adapters publish through external APIs.
7. Analytics are pulled back into Postgres for reports and next-cycle planning.

## Integration Boundaries

- External APIs are wrapped behind adapters.
- Provider responses are normalized before reaching application code.
- Database writes use explicit queue states.
- Scheduler jobs are idempotent and safe to retry.
- Operator actions are auditable without exposing secrets.

## Removed From Public Snapshot

- Real tenant rows.
- Live API credentials.
- Platform account IDs.
- Production analytics.
- Private prompt variants.
