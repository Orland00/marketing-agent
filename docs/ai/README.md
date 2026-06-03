# AI Operations

This repo exposes the public shell of a production-grade AI content pipeline.
The live tenant data, real prompts, analytics, account IDs, and provider
configuration are intentionally absent.

## AI Surface

- `src/lib/ai.ts`: model call boundary and platform-specific copy generation.
- `src/routes/pending.ts`: human review queue for drafts before publishing.
- `src/telegram/handler.ts`: operator approval, regeneration, and scheduling loop.
- `src/lib/publisher.ts`: deterministic queue processing after approval.
- `docs/ai/agent-topology.md`: public map of the strategy, drafting, critic,
  rewrite, scheduler, and analytics agents.

## Operating Model

1. Tenant context is loaded from the database.
2. A prompt bundle is assembled from brand voice, audience, templates, and target
   platforms.
3. The model returns structured copy.
4. The draft is held for human approval.
5. Approved work moves into the publish queue.
6. Analytics are pulled back for follow-up prompts and reporting.

## Guardrails

- No autonomous publishing.
- No secrets in prompts.
- No tenant IDs in public logs.
- No model output is trusted until it passes validation and human review.
- Failed generations remain drafts and never enter the publish queue.

## Public Evals

The files under `docs/ai/evals/` are sanitized examples of the kinds of checks
used to catch weak output before a draft reaches an operator.
