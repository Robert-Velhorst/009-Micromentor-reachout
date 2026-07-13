# MARO Tool-Wide Audit

Date: 2026-07-14
Scope: active React command center, Express API, local ledger persistence, ngrok exposure, dependency graph, release checks, and Windows 11 installer.

## Confirmed Findings And Fixes

| Area | Finding | Resolution |
| --- | --- | --- |
| Network boundary | Same-origin mutation checks could be bypassed through an attacker-controlled Host value after DNS rebinding. | Added a fail-closed Host allowlist for localhost, exact configured hosts, and explicitly enabled ngrok domains; invalid hosts receive HTTP 421. |
| Persistence | Direct file replacement could leave a corrupt ledger after an interrupted write. | Added synchronized temporary writes, atomic replacement, a rolling backup, automatic audited recovery, and temporary-file cleanup. |
| Restore safety | Backup shape checks did not prove references or IDs were internally consistent. | Added unique-ID and cross-record referential-integrity validation before restore. |
| API semantics | Audited exports used GET while modifying audit state, and API/parser failures could fall through inconsistently. | Moved audited exports to guarded POST routes, standardized API JSON errors, added JSON limits, no-store API caching, and JSON 404 responses. |
| Workflow validation | Invalid classifications, dates, or cross-mentor message references could enter response and follow-up operations. | Added bounded enum/date validation and campaign-plus-mentor message ownership checks. |
| Read behavior | Campaign reads could change `updatedAt`, and initial UI load made seven ledger requests plus repeated runtime probes. | Recalculation now writes timestamps only when totals change; `/api/dashboard` returns one aggregate snapshot and runtime status refreshes only when needed. |
| Duplicate operations | Fast repeated clicks could submit identical requests concurrently. | The client coalesces exact in-flight method, URL, and body combinations without suppressing later intentional actions. |
| Static footprint | A second inactive frontend, unused UI modules, duplicate package metadata, and 59,633,295 bytes of unreachable images increased review and install cost. | Removed the dead tree and assets, retained only active components, and pruned the dependency graph. |
| Cache correctness | Installed clients could retain stale application HTML or assets after an upgrade. | Added no-cache handling for HTML and immutable caching only for fingerprinted build assets. |
| Release proof | The release gate built the installer without exercising the resulting executable. | Added an isolated, no-shortcut, no-registry, no-launch install and seven-file payload assertion with automatic cleanup. |

## Measured Result

- Production JavaScript: 318.70 KB minified, 89.29 KB gzip.
- Production CSS: 39.59 KB minified, 7.48 KB gzip, down from 109.78 KB and 17.46 KB gzip.
- Served production directory: 370,955 bytes across four files.
- Installed dependency graph: 202 packages; `npm audit --audit-level=low` reports zero known vulnerabilities.
- Production runtime snapshot: 16.86 MB working set, 64.43 MB private memory, and 12 threads.
- Aggregate dashboard benchmark: 25 requests averaged 28.56 ms with a 43.47 ms p95 for a 21,590-byte response on this Windows machine.
- Windows installer: 34,659,840 bytes; isolated seven-file payload check passed; SHA-256 `0D6FF5D05440BCF24B701C4478FF7F5F508EB5B4C4E599E5F6D120E14137BAD9B`.
- Browser QA: persisted campaign edit, clean console, meaningful DOM, and no horizontal overflow at desktop width or the in-app browser's effective 749 px minimum width.
- API smoke covers Host rejection, mutation guards, invalid JSON and oversized payloads, guarded exports, restore integrity, corrupt-ledger recovery, workflow validation, and the complete outreach/billing lifecycle.

## Enhancement Decisions

Do next when evidence supports it:

- Add list virtualization when real campaigns exceed a few hundred visible mentors.
- Move CSV and restore parsing to chunked or worker execution when measured files cause interaction delay.
- Add signed update checks together with an Authenticode-signed release channel.

Keep out of the current product:

- Autonomous MicroMentor sending without platform authorization, consent controls, and explicit rate limits.
- Public tunnel defaults or cloud sync without authentication and retention policy.
- Polling, background scoring, or speculative caching that weakens the local ledger's observable state.

## Remaining External Risk

The Windows installer is functional and self-contained but unsigned. Windows can show an unknown-publisher warning until Noodzakelijk Online provides a trusted code-signing certificate and signed release infrastructure.
