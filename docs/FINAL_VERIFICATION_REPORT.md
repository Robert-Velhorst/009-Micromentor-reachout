# Final Verification Report

Date: 2026-08-09
Branch: `codex/giant-goal-completion`
Starting commit: `dba8620ef456f3dec8dd3f946c54dae6fbc15f39`

## Verification Status

The release candidate passed the local production gate. The final commit and remote branch are recorded by Git after this document is frozen and in the release handoff; no unrun check is represented as passing.

| Gate | Result |
| --- | --- |
| `npm run check:release` | Passed: doctor, zero-vulnerability audit, TypeScript, encrypted API/adversarial smoke, production build, legacy migration, installed encrypted runtime, owned-process stop, upgrade preservation, and installer build |
| Production browser | Passed: onboarding persistence, pause/resume, DNC, desktop/mobile layout, no console errors, and no page overflow |
| Docker | Passed: readiness/health/root/feed HTTP 200, non-root `maro`, read-only root, all capabilities dropped, encrypted persistence |
| ngrok | Live dedicated HTTPS endpoint passed Traffic Policy Basic Auth: unauthenticated 401, authenticated UI/runtime 200, correct target on inspector 4042, then bounded shutdown |
| HAI connector | Local and live-ngrok `hai.generic_json_feed.v1` manifest/feed passed with read-only authority, stable action cards, ETag/304 coverage, and two cloud-smoke action cards |
| Fresh source snapshot | Reproducible install, doctor, typecheck, audit, and API smoke result recorded before commit |

## Artifact Evidence

- Windows installer: `artifacts/MARO-Windows11-Setup.exe`
- Installer version: 1.2.1.
- Installer size: 34,673,152 bytes (33.07 MiB).
- Installer SHA-256: `7789018043281F74F0B12A38A1F9BA3DCD0C92C05540DF7B2E34D9DD6B856142`.
- Production browser payload: 377,717 bytes across four files; JavaScript 324.76 KB (90.55 KB gzip), CSS 39.84 KB (7.56 KB gzip).
- Browser-QA Node process: 71.1 MB RSS after interactive use; 20 dashboard reads measured 6.86 ms median and 9.65 ms p95.
- Hardened container idle sample: 0.00% CPU, 17.84 MiB memory, 11 processes.
- Docker context optimization reduced the observed changed-source transfer from 342.91 MB to 806.21 KB by excluding generated local caches; a subsequent cached no-change pass transferred 3.52 KB.

## Workflow Evidence

- The critical path runs against the real local encrypted ledger: project/campaign, mentor scoring, draft/review, manual handoff, delivery evidence, response, follow-up, billing, outcomes, backup/restore, retention, and audit.
- Server guards reject DNC, identity cooldown, paused outbound, stale approval, duplicate mutation, cross-site mutation, hostile Host headers, oversized JSON, invalid relationships, and ambiguous send confirmation.
- HAI receives only read-only next-action cards. It cannot approve drafts, confirm sends, mutate providers, or obtain message/response bodies.
- Windows keeps replaceable application files separate from `%LOCALAPPDATA%\MARO-Data`, protects a random ledger key with per-user DPAPI, migrates legacy data without overwriting conflicts, and retains ledger/key bytes across reinstall.
- MARO uses current ngrok Traffic Policy Basic Auth and `/api/endpoints`, supports a dedicated `MARO_NGROK_URL`, and identifies only the endpoint targeting its own loopback port across inspectors `4040`-`4050`.
- MicroMentor browser discovery and the final Send click remain explicit human actions; no fake provider success or hidden automation ships.

## Current Known Limits

- MicroMentor discovery and final sending are manual; no authorized provider API exists here.
- The product is single-user/local. Team RBAC and cross-user isolation are N/A until a shared backend is designed.
- The installer is unsigned until an Authenticode certificate and release process are supplied.
- Locale settings support English/Dutch readiness, but the complete Dutch message catalog remains roadmap work.
- A live ngrok URL requires the owner's authenticated ngrok account plus `NGROK_BASIC_AUTH`; the temporary acceptance endpoint was deliberately stopped after verification.
