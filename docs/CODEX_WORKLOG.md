# Codex Worklog

## 2026-09-06 Windows Tunnel Configuration Files

1. Reproduced leftover temporary hosts files under real Windows file-sharing locks and a new agent left alive after process-state persistence failed.
2. Added exclusive configuration creation, flushed UTF-8 writes, replacement without pre-deletion, bounded deletion retries and explicit retained-file diagnostics. Process-state publication now precedes host authorization; blocked cleanup, state persistence or host publication stops the newly started owned process.
3. Added ten Windows configuration scenarios to the existing 22 checks. They execute generated functions and actual startup/publication blocks with owned process boundaries and real file locks. Positive controls caught PowerShell's null-to-empty-string .NET binding; replacement uses `NullString.Value`. Review strengthened case isolation and an observer that checks registration at the publication boundary without altering the real writer.
4. The full pinned-runtime release gate passed in `artifacts/release-check-windows-config-2026-09-06.log`: 32 Windows function/block cases, 29 source-launcher cases, installed startup, host revocation, configuration restart, upgrades, fresh-key recovery and shutdown. Document links and patch whitespace checks passed.
5. The rebuilt local installer is unsigned; its exact size and hash are recorded in `PRODUCTION_READINESS.md`. No public tunnel, real ngrok agent or MicroMentor message was used. Complete installed/provider acceptance and Windows partial-write/flush and physical-disk failures remain open.

## 2026-09-06 Source Tunnel Configuration Failures

1. Reproduced two filesystem-failure regressions against the actual source launcher: a partial credentials file survived failed creation, and failed Host replacement had already removed its predecessor.
2. Registered temporary-file ownership immediately after exclusive creation, retained failed-write/close paths for shutdown cleanup, and replaced the Host file without first deleting it. Failed credential-file removal now prevents a successful startup; persistent removal refusal reports the owned path without contents and returns failure, including on normal signal handling.
3. Added twelve real-filesystem-boundary fault cases to the existing source-process suite. Independent review strengthened genuine exclusive-open collision checks, normal-stop cleanup failure status, and explicit numeric exit/no-signal assertions. Final focused review found no new actionable issue.
4. Pinned-runtime `npm run check` and `npm test` passed, including all 29 source-launcher scenarios. Logs: `artifacts/check-ngrok-config-2026-09-06.log` and `artifacts/test-ngrok-config-2026-09-06.log`. Local document links and patch whitespace checks passed.
5. The installer payload was not changed or rebuilt by this patch. Source fault injection is not Windows PowerShell I/O acceptance, physical-disk testing, or live ngrok acceptance. No provider requests, messages or production publication were performed.

## 2026-09-06 Windows Tunnel Ownership

1. Reproduced acceptance of an unrelated correctly targeted endpoint and termination from a stale process-creation record against the actual generated PowerShell functions.
2. Added unique endpoint identity, HTTPS/target/domain checks, bounded inspector responses and workspace-keyed configuration fingerprints. Retained verified process handles through reuse and stop operations.
3. Cleared generated Host authorization on both fresh startup and server reuse, including skipped tunnel discovery; explicit operator-trusted hosts remain separate.
4. Added 22 packaged-function/fixture-cleanup scenarios and fresh/reused installed-runtime Host tests. Independent review caught the process-identity race, stale-host reuse and test-child cleanup issues; all three were addressed. A minor test-only timing observation remains: the Host polling window and each HTTP request have separate five-second bounds, so a final request can extend the total wait beyond five seconds.
5. The full pinned-runtime Windows release gate passed in `artifacts/release-check-windows-ngrok-final-2026-09-06.log`, including installed startup, configuration restart, stopped/in-use upgrade, fresh-key recovery and final shutdown. The first attempt failed a cold HTTP fixture initialization check; isolated warm-up is now excluded from assertion counts and production deadlines were not relaxed.
6. Updated README, operational evidence and the prioritized production acceptance checklist. No real ngrok agent/public tunnel, MicroMentor message, signed release or merge to main was performed.

## 2026-08-14 Completion Re-Audit

1. Reconciled the clean completion branch with the remote and reran the current Windows release gate.
2. Reproduced an intermittent application-directory access-denied failure during installed-runtime upgrade preservation.
3. Made owned-process shutdown wait for actual exit and added bounded transient-lock retries around atomic directory rotation and rollback.
4. Extended release coverage to reject a stop helper that returns while the installed server process remains alive.
5. Added ownership-checked in-use upgrades and configuration-aware restarts so HAI, tunnel, Host, pause, and version changes cannot reuse a stale server environment.
6. Removed broad ngrok suffix trust, added exact launcher-managed Host files, and proved the real endpoint returns `200` while another ngrok Host returns `421`.
7. Repeated live installed-ngrok acceptance with Basic Auth (`401` without credentials), encrypted persistence, read-only HAI, exact target discovery, and complete teardown.
8. Recovered fresh in-app Browser acceptance on the final bundle: desktop/mobile direct rendering, no horizontal overflow, clean console, working tab navigation, and a reversible privacy-control interaction all passed.

## 2026-08-08

1. Rendered and visually checked all 124 prompt pages; extracted and mapped phases 000-115.
2. Confirmed repository branch, remote, existing release baseline, runtime, installer, extension, persistence, tests, and user workflows.
3. Found and corrected the static-only Docker deployment defect.
4. Added safety settings, DNC, cooldown, emergency pause, uncertain-send resolution, request IDs, rate limiting, idempotency, readiness, diagnostics, retention, support export, and integrity checks.
5. Added UI onboarding/safety controls, CI, doctor command, changelog, dependency remediation, and required evidence docs.
6. Extended the encrypted real-server smoke test with adversarial safety scenarios.
7. Matched the HAI integration to its real owner-scoped `generic_json_feed` contract and kept it read-only and disabled by default.
8. Completed browser acceptance, the full release gate, isolated Windows installation, ngrok fail-closed verification, and hardened Docker runtime smoke.
9. Reduced Docker build context transfer from 342.91 MB to 3.52 KB by excluding the local npm cache and private environment files.
10. Froze final evidence only after the security, resource, installer, container, and source-snapshot gates passed.

## 2026-08-09 Continuation Audit

1. Reopened completion against current runtime evidence and found that the installer kept default data beneath a replaceable application directory.
2. Added separate durable Windows data, conflict-preserving legacy migration, automatic DPAPI-protected encryption, atomic upgrades, and ownership-checked process lifecycle helpers.
3. Replaced deprecated ngrok Basic Auth flags and tunnel-list API usage with Traffic Policy, dedicated endpoint support, exact Host allowlisting, and target-aware Agent endpoint discovery across ports 4040-4050.
4. Required encrypted persistence in Docker Compose and expanded the release gate to launch, stop, reinstall, and compare installed ledger/key bytes.
5. Completed bounded live HTTPS acceptance through the installed Windows launcher, including unauthenticated rejection, authenticated HAI feed access, encrypted storage, and verified tunnel teardown.
