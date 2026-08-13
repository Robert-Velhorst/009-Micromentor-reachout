# Final Verification Report

Date: 2026-08-14
Branch: `codex/giant-goal-completion`
Starting commit: `dba8620ef456f3dec8dd3f946c54dae6fbc15f39`

## Verification Status

The release candidate passed the local production gate. The final commit and remote branch are recorded by Git after this document is frozen and in the release handoff; no unrun check is represented as passing.

| Gate | Result |
| --- | --- |
| `npm run check:release` | Passed: doctor, zero-vulnerability audit, TypeScript, encrypted API/adversarial smoke, production build, legacy migration, configuration restart, owned-process stop, stopped/in-use upgrade preservation, and installer build |
| Production browser | The unchanged UI bundle retains the 2026-08-09 passed onboarding, pause/DNC, desktop/mobile, console, and overflow evidence. On 2026-08-14 the in-app Browser webview failed to attach after three recovery attempts; current app-shell/API HTTP checks still passed. |
| Docker | Passed: readiness/health/root/feed HTTP 200, encrypted persistence, non-root `maro`, read-only root, all capabilities dropped; idle sample 0.05% CPU and 19.5 MiB |
| ngrok | Live dedicated HTTPS endpoint passed Traffic Policy Basic Auth and exact Host policy: unauthenticated 401, authenticated UI 200, own Host 200, another ngrok Host 421, inspector 4042, then complete teardown |
| HAI connector | Local and live-ngrok `hai.generic_json_feed.v1` manifest/feed passed with read-only authority, stable action cards, ETag/304 coverage, and two cloud-smoke action cards |
| Fresh source snapshot | Reproducible install, doctor, typecheck, audit, and API smoke result recorded before commit |

## Artifact Evidence

- Windows installer: `artifacts/MARO-Windows11-Setup.exe`
- Installer version: 1.2.2.
- Installer size: 34,676,224 bytes (33.07 MiB).
- Installer SHA-256: `3A538D668310D6489511DF0DF2839EF9E17D6C4B7B36B46E0AE01026F661A70A`.
- Production browser payload: 377,717 bytes across four files; JavaScript 324.76 KB (90.55 KB gzip), CSS 39.84 KB (7.56 KB gzip).
- Packaged Node process: 51.54 MiB working set, 32.06 MiB private memory, 12 threads; 50 dashboard reads measured 31.28 ms median and 51.44 ms p95 through PowerShell HTTP overhead.
- Hardened container idle sample: 0.05% CPU, 19.5 MiB memory, 11 processes.
- Docker context optimization reduced the observed changed-source transfer from 342.91 MB to 806.21 KB by excluding generated local caches; a subsequent cached no-change pass transferred 3.52 KB.

## Workflow Evidence

- The critical path runs against the real local encrypted ledger: project/campaign, mentor scoring, draft/review, manual handoff, delivery evidence, response, follow-up, billing, outcomes, backup/restore, retention, and audit.
- Server guards reject DNC, identity cooldown, paused outbound, stale approval, duplicate mutation, cross-site mutation, hostile Host headers, oversized JSON, invalid relationships, and ambiguous send confirmation.
- HAI receives only read-only next-action cards. It cannot approve drafts, confirm sends, mutate providers, or obtain message/response bodies.
- Windows keeps replaceable application files separate from `%LOCALAPPDATA%\MARO-Data`, protects a random ledger key with per-user DPAPI, migrates legacy data without overwriting conflicts, waits for owned-process exit, upgrades while open, and retains ledger/key bytes.
- MARO uses current ngrok Traffic Policy Basic Auth and `/api/endpoints`, supports a dedicated `MARO_NGROK_URL`, identifies only the endpoint targeting its own loopback port across inspectors `4040`-`4050`, and allowlists only that exact Host.
- MicroMentor browser discovery and the final Send click remain explicit human actions; no fake provider success or hidden automation ships.

## Current Known Limits

- MicroMentor discovery and final sending are manual; no authorized provider API exists here.
- The product is single-user/local. Team RBAC and cross-user isolation are N/A until a shared backend is designed.
- The installer is unsigned until an Authenticode certificate and release process are supplied.
- Locale settings support English/Dutch readiness, but the complete Dutch message catalog remains roadmap work.
- A live ngrok URL requires the owner's authenticated ngrok account plus `NGROK_BASIC_AUTH`; the temporary acceptance endpoint was deliberately stopped after verification.
