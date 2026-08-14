# Codex Worklog

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
