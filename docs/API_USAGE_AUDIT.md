# API Usage Audit

All registered endpoints are consumed by the React client, the production smoke suite, diagnostics tooling, or the manual extension workflow. No legacy automated-send endpoint exists.

## Endpoint Groups

- Runtime: health, readiness, diagnostics, runtime status.
- Workspace: settings, integrity, support bundle, retention, backup, restore preview/apply, reset.
- Planning: projects, campaigns, readiness/actions, source records, discovery plans.
- Mentors: list/detail/timeline/create/update/import/export/deduplicate.
- Messaging: draft/edit/quality/approve/reject/manual handoff/send attempt/uncertain resolution.
- Relationship: responses, follow-ups, outcomes, campaign history export.
- Operations: resource sessions, billing records, usage reports, invoice records, audit events, HAI read-only status/manifest/generic JSON feed.

## Contract Rules

- Mutations require same-app marker and reject cross-site browser requests.
- Client mutations include an idempotency key.
- Errors retain the existing `error` string and add `code`, `requestId`, and `retryable` where produced by the API envelope.
- Read endpoints do not persist. Mutation routes persist atomically unless a validation response already ended the request.
- API and support outputs never expose the ledger path or encryption secret.

## N/A Provider Calls

There is no MicroMentor, email, AI, payment, analytics, or HAI mutation provider configured. The HAI connector is an opt-in local `generic_json_feed` that emits bounded action cards with stable external IDs, a cursor, ETag support, and manual-only authority metadata. Provider quota/retry behavior is therefore N/A; manual handoff, local cooldown, and uncertainty resolution are the applicable safety controls.
