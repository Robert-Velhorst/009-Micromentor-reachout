# Acceptance Tests

| Area | Acceptance criterion | Automated evidence |
| --- | --- | --- |
| Startup | Production bundle serves UI and API from one process. | `npm test` |
| Campaign | Operator can create, edit, pause, complete, and export a campaign. | `npm test` |
| Intake | Manual and CSV records are validated, deduplicated, scored, and source-linked. | `npm test` |
| Review | Blocked quality cannot be approved; edits invalidate approval. | `npm test` |
| Delivery | Only approved exact snapshots can create a handoff or confirmed send. | `npm test` |
| Safety stop | Workspace or environment pause blocks handoff and send confirmation. | `npm test` plus UI browser test |
| Opt-out | Do-not-contact blocks drafting/handoff and cancels scheduled follow-up. | `npm test` plus UI browser test |
| Ambiguity | Uncertain delivery remains approved and requires explicit resolution. | `npm test` |
| Idempotency | Repeating a mutation key and body replays the first response. | `npm test` |
| HAI connector | Opt-in feed matches HAI `generic_json_feed`, is conditionally readable, and grants no write authority. | `npm test` |
| Privacy | API responses are no-store; support bundle omits names, message bodies, and local paths. | `npm test` |
| Recovery | Atomic write, encrypted storage, rolling backup, restore validation, and corruption recovery work. | `npm test` |
| Deployment | Docker runs Express as non-root with persistent data and readiness healthcheck. | `docker build`, Compose smoke |
| Windows | Installer migrates legacy data, generates a DPAPI-protected key, runs encrypted, restarts changed runtime configuration, stops only its owned process, upgrades while open, and preserves ledger/key bytes. | `npm run check:release` |
| Cloud | Dedicated ngrok HTTPS endpoint rejects unauthenticated access, serves the UI plus read-only HAI feed with valid Basic Auth, accepts only its exact Host, and rejects another ngrok Host. | `npm test` plus bounded live ngrok acceptance in `FINAL_VERIFICATION_REPORT.md` |

Manual browser evidence must cover desktop and mobile layout, onboarding completion, pause/resume, do-not-contact, tab navigation, console errors, and network failures. Results are recorded in `FINAL_VERIFICATION_REPORT.md`.
