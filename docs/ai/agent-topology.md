# Agent Topology

Public shell for the agent roles used around the content pipeline.

| Agent | Responsibility | Output |
|-------|----------------|--------|
| Strategy Agent | Turns campaign intent into platform objectives | Campaign brief |
| Drafting Agent | Generates first-pass post variants | Draft copy |
| Critic Agent | Checks claims, tone, CTA, and platform fit | Review notes |
| Rewrite Agent | Applies operator feedback without changing intent | Revised draft |
| Scheduler Agent | Places approved content into queue windows | Schedule proposal |
| Analytics Agent | Summarizes performance into next-cycle guidance | Digest |

## Rules

- Agents draft and recommend; operators approve.
- Agents never receive credentials or platform tokens.
- Agents cannot publish directly.
- Agent outputs are stored as drafts, notes, or digests.
