# Technical Audit

Date: 2026-08-09

## Product Boundary

MARO is a local-first, single-operator outreach ledger. It helps an operator define a campaign, record manually discovered mentors, score fit, draft and approve messages, prepare a manual browser handoff, record delivery evidence, classify replies, schedule follow-ups, and export results. It does not scrape MicroMentor, authenticate to MicroMentor, or send messages autonomously.

## Starting Point

- React 18 and Tailwind frontend built with Vite as a build tool only.
- Express 4 API bundled by esbuild and persisted to atomic JSON or AES-256-GCM encrypted JSON.
- ngrok launcher with Basic Auth or explicit public opt-in.
- Windows 11 self-extracting installer and manual-handoff browser extension.
- Existing approval, stale-approval, duplicate identity, backup/restore, audit, and resource-usage controls.

## Findings And Corrections

| Severity | Finding | Resolution |
| --- | --- | --- |
| Critical | Docker copied the build into nginx, omitted the Express API, and copied the wrong frontend directory level. | Replaced it with a non-root Node runtime serving `dist/index.cjs` and `dist/public`; added a data volume, readiness healthcheck, dropped capabilities, and loopback-only Compose exposure. |
| Critical | Windows upgrades deleted the install directory while the default workspace lived beneath it. | Separated durable data, added conflict-preserving legacy migration and atomic app replacement, and proved ledger/key bytes survive reinstall. |
| High | A transitive `nanoid` advisory was present. | Refreshed the lockfile; `npm audit --audit-level=low` reports zero vulnerabilities. |
| High | No durable do-not-contact state or emergency outbound stop. | Added identity-aware do-not-contact enforcement, follow-up cancellation, UI controls, workspace pause, and environment-enforced pause. |
| High | Ambiguous delivery could only be called sent or failed. | Added `uncertain` send attempts and explicit confirmed/failed resolution. |
| Medium | No request correlation, rate limit, or server mutation idempotency. | Added request IDs, a conservative local API limit, and ten-minute idempotent mutation replay. |
| Medium | Diagnostics, retention, support export, integrity, and startup checks were incomplete. | Added readiness, diagnostics, settings, integrity, sanitized support bundle, retention preview/apply, and `npm run doctor`. |
| Medium | No CI. | Added Linux verification/Docker and Windows installer jobs. |
| Medium | HAI integration status was descriptive rather than consumable. | Added an opt-in, read-only `hai.generic_json_feed.v1` manifest/feed with stable action cards, conditional reads, and no provider-write authority. |
| Medium | ngrok used a deprecated Basic Auth flag and assumed inspector port 4040, which could identify another tool's tunnel. | Moved Basic Auth into Traffic Policy, added dedicated endpoint support, exact Host allowlisting, current Agent API discovery across ports 4040-4050, and target matching. |
| Low | Local npm cache inflated Docker context transfer to 342.91 MB. | Excluded generated caches and private environment files; the final changed-source transfer measured 806.21 KB and a cached no-change pass measured 3.52 KB. |

## Architecture Decisions

- Keep JSON schema version 1 and normalize new fields so existing workspaces and backups remain readable.
- Keep sending manual. The extension only transfers approved content; it cannot click Send.
- Keep all persistence under one local workspace boundary. App-level multi-user auth and RBAC are N/A until a shared service exists.
- Preserve Vite only as the frontend compiler. `npm run dev`, preview, installed runtime, and Docker all run Express/ngrok rather than a Vite development server.
- Treat application files as replaceable and Windows workspace data/key material as durable per-user state outside the installation directory.

## Remaining External Gates

- MicroMentor has no configured provider API or authorization in this repository. Discovery and sending remain manual and subject to its current terms.
- Public ngrok access is not app authentication. Use `NGROK_BASIC_AUTH`; do not share an unprotected workspace.
- Authenticode signing and trusted update delivery require a certificate and release infrastructure.
- Dutch message catalog coverage is not complete; locale persistence is ready, while most copy remains English.
