# Prompt Registry

Public prompt shells only. Real prompts and tenant-specific data are not stored
in this repository.

| Prompt | Purpose | Hard Requirements |
|--------|---------|-------------------|
| `content.caption.v1` | Draft short-form social copy | Brand voice, platform, CTA, no invented claims |
| `content.carousel.v1` | Generate carousel copy blocks | Hook, 3-5 frames, final CTA |
| `content.rewrite.v1` | Rewrite a rejected draft | Preserve intent, fix operator feedback |
| `analytics.digest.v1` | Summarize account performance | Use supplied metrics only |
| `image.brief.v1` | Brief a visual asset | No logos, no faces, no copyrighted style requests |

## Routing Policy

- Small edits use the lowest-latency model available.
- New creative drafts use the stronger model tier.
- Analytics summaries run with deterministic temperature settings.
- Human feedback is stored as product feedback, not as hidden prompt text.
