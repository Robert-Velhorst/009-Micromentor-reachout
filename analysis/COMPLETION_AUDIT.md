# MARO Completion Audit

Date: 2026-07-14

## Repository Understanding

MARO retains the existing React, Vite build, and Express structure while using the Express server as the operational boundary. Vite is a build tool only in the default workflow: `npm run dev` and `npm run preview` build MARO and launch the protected ngrok flow. The production command center is `client/src/pages/Home.tsx`; `server/ledger.ts` owns the persisted local operating ledger and API behavior.

The ledger uses local JSON persistence with optional AES-256-GCM encryption rather than introducing a second database stack. It is hidden from git, normalized on load, cached for read efficiency, and exposed through service-like route helpers. This satisfies the local-first persistence objective while preserving a possible later storage migration boundary.

## Acceptance Evidence

| Requirement | Authoritative evidence | Result |
| --- | --- | --- |
| Real backend endpoints for core outreach data | `server/ledger.ts` registers health, project, campaign, source, mentor, message, response, follow-up, outcome, resource, billing, invoice, and audit routes. | Proven |
| Campaigns can be created and listed | `POST/GET /api/campaigns`; encrypted API smoke creates, updates, lists, and reloads a campaign. | Proven |
| Mentors can be created, imported, and listed | Manual and CSV intake routes preserve structured source data; smoke covers mapped CSV columns, duplicate skips, unsafe URL removal, and export. | Proven |
| Message drafts can be created | Campaign and global draft routes persist generated and edited drafts with quality reviews. | Proven |
| Messages cannot be marked sent without approval and manual confirmation | Send-attempt routes reject unapproved or stale content, require delivery evidence, preserve failed attempts, and never call an external send API. Smoke covers each rejection and success transition. | Proven |
| Responses can be recorded | Response routes persist classification and text, update campaign counts, cancel inappropriate follow-ups, and feed outcome actions. | Proven |
| Follow-ups can be scheduled | Follow-up routes support create, edit, draft, complete, and cancel; configurable campaign timing is covered by smoke tests. | Proven |
| Resource sessions can be stored | Process-level CPU time, RSS duration, ledger storage, and observed payload bytes are stored on session end. Measurement limitations are disclosed. | Proven |
| Cost reports can be generated | Billing uses stored measured sessions and the documented `resource cost x 2` formula; usage reports and immutable local invoice snapshots are covered by smoke tests. | Proven |
| Audit events are recorded | Important creates, edits, approvals, handoffs, attempts, responses, follow-ups, outcomes, restore/reset, billing, and duplicate decisions write persisted audit events. | Proven |
| Frontend dashboard uses real persisted data | The initial command-center load uses the aggregate `/api/dashboard` snapshot; focused routes still serve relationship history and mutations. Production browser QA confirms campaign edits persist and rerender. | Proven |
| Storage survives interrupted or corrupt writes | Ledger writes use temporary-file sync plus atomic replacement. A rolling backup is recovered and audit logged when the primary file is corrupt; smoke coverage verifies recovery and temporary-file cleanup. | Proven |
| Backup restore preserves referential integrity | Restore preview rejects duplicate IDs and orphaned project, campaign, mentor, message, session, billing, response, follow-up, invoice, and outcome references. | Proven |
| Local API resists Host-header rebinding | The server accepts local hosts, configured exact hosts, and ngrok suffixes only when tunnel mode is explicitly configured; unknown hosts receive HTTP 421. | Proven |
| Build and type contract pass | `npm run build`, `npm run check`, and the composite `npm run check:release` are release gates. | Proven |
| No private runtime artifacts are committed | Runtime ledger paths, installer output, exports, invoices, logs, and environment files are ignored; tracked-file hygiene checks find none. | Proven |
| No unsafe autonomous outreach exists | The server exposes manual evidence recording, not a platform send endpoint. The optional extension has no background worker, storage, network client, persistent host access, or send action. | Proven |

## Requested Delivery Evidence

- Ngrok replaces Vite as the default development and preview entry point. Unauthenticated public tunnels are refused unless the operator explicitly opts in; basic authentication is the documented normal path.
- The Windows 11 self-extracting installer embeds Node and the production app, writes version metadata, creates launch and uninstall paths, and registers current-user uninstall metadata. An isolated install verifies all required payload files.
- The security audit covers local bind scope, tunnel exposure, browser headers and CSP, encrypted storage, privacy reveal controls, CSV formula injection, unsafe profile URLs, bounded scoring input, cross-site API mutations, approval snapshots, duplicate outreach, extension permissions, dependency vulnerabilities, and error disclosure.
- The resource audit replaces production random usage with process-level measurements, avoids read-only ledger rewrites, caches encrypted reads, removes external font requests and 59.6 MB of unreachable assets, coalesces identical in-flight requests, and uses one aggregate dashboard read instead of seven startup reads.
- Feature analysis is maintained in `analysis/ENHANCEMENT_BACKLOG.md`; all five operating-ledger implementation slices are delivered.

## Remaining External Work

Authenticode signing and signed-release update checks require a trusted code-signing certificate and a release channel. The installer is functional but Windows may show an unknown-publisher warning until that infrastructure exists. This is a distribution-trust enhancement, not a missing operating-ledger acceptance criterion.

Large-list virtualization and chunked CSV/restore processing remain conditional optimizations. Current measured data volume and browser checks do not justify their runtime and maintenance cost yet.
