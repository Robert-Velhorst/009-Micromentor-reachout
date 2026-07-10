# MARO Security, Resource, and Feature Analysis

Date: 2026-05-24
Repository revision scanned: 541aad3 plus local working-tree changes

## Scope

- Production app entrypoints: `client/src/App.tsx`, `client/src/pages/Home.tsx`, `client/src/main.tsx`, `server/index.ts`.
- Runtime and exposure path: `scripts/build.mjs`, `scripts/ngrok.mjs`, packaged `dist/index.cjs`, local HTTP server, ngrok launcher.
- Installer path: `scripts/build-windows-installer.mjs`, generated `artifacts/MARO-Windows11-Setup.exe`.
- Supporting components that affected static confidence: `ErrorBoundary`, `Map`, `calendar`, `usePersistFn`, Vite config, README.

## Threat Model

- The tool is a local outreach console that stores mentor/contact drafts in a local server-side ledger file.
- The largest trust-boundary change is ngrok exposure: local-only content can become reachable through a public tunnel.
- No server-side database, authentication backend, payment logic, or third-party API write path is active in the production app.
- Primary risks are accidental public exposure, browser-side data leakage, stale debug tooling, dependency/build drift, and installer tampering.

## Findings And Fixes

- Public bind risk: the server previously inherited a broad host stance. Fixed by defaulting production/server runs to `127.0.0.1`; ngrok now targets `http://127.0.0.1:<port>` explicitly.
- Missing browser hardening headers: added `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, and a restrictive CSP.
- Production error disclosure: `ErrorBoundary` no longer shows stack traces outside development builds.
- Dev log ingestion DoS and resource-churn risk: the Vite debug collector is now disabled unless `MARO_DEBUG_COLLECTOR=1` is set, and still caps request payloads at 256 KB before writing logs when explicitly enabled.
- Ngrok access control: launcher supports optional `NGROK_BASIC_AUTH` so a tunnel can require basic auth.
- Local ledger confidentiality: setting `MARO_LEDGER_PASSPHRASE` stores the ledger as an AES-256-GCM encrypted envelope instead of plaintext JSON.
- Shoulder-surfing reduction: session privacy mode hides mentor notes, draft bodies, response text, follow-up text, and delivery evidence until explicitly revealed.
- Manual handoff safety: review queues can open the stored mentor profile URL and copy the revealed reviewed draft, but the app still does not automate external sending.
- Failure transparency: failed manual send attempts are audit logged and remain retryable instead of being hidden, converted into sent state, or allowed to schedule follow-ups.
- Low-cognitive-load operations: dashboard next actions now open the relevant campaign tab directly and preserve mentor context where available, reducing manual navigation during review, follow-up, billing, and outcome work.
- Project-linked integrity: campaign creation and updates now validate project IDs, and the command center exposes project creation plus campaign project assignment so outreach stays tied to the correct broader goal.
- Installer dependency and removal risk: the Windows installer embeds the Node runtime and built app, so the end user does not need a separate Node/npm install; it also writes installed-version metadata and registers a current-user uninstall entry.
- Static type drift: fixed legacy `Map`, `calendar`, and `usePersistFn` type errors; `npm run check` now passes.
- Release regression risk: added `npm run check:release` to run TypeScript checks, the production encrypted-ledger API smoke test, production surface checks, and the Windows installer build on Windows hosts.
- External font privacy: removed Google Fonts preconnect/stylesheet requests and tightened CSP font/style directives back to self-only sources plus inline styles required by the bundled UI.
- Production surface regression risk: the encrypted-ledger smoke test now fails if the root app shell reintroduces external production asset URLs, Google Fonts references, development debug-collector injection, missing browser hardening headers, or weakened CSP directives.
- Workspace restore integrity: restore validation now requires message-quality and invoice-record arrays, preventing accepted backups from silently dropping review or billing-report history.
- Outreach control integrity: campaign-level tone and follow-up timing are persisted and used for generated drafts plus automatic follow-up suggestions after manual send confirmation, keeping workflow automation aligned with the operator's configured rules. Negative responses now cancel pending follow-ups instead of leaving accidental outreach work queued. Duplicate outreach guards now block active or sent campaign drafts for the same mentor identity/profile URL, including manual duplicate mentor records, and next actions identify duplicate profiles for operator review.
- Relationship history integrity: mentor timelines are now derived from persisted server-side ledger records, are available through a dedicated local API route, and keep delivery evidence or failed-send details behind the existing privacy reveal controls instead of duplicating that derivation in the browser. The command center loads only the selected mentor's timeline so normal campaign refreshes do not serialize every contact's full history.
- Dependency supply-chain integrity: added an npm lockfile for reproducible installs, applied non-breaking audit remediations, and upgraded the build-only Vite/esbuild toolchain to patched releases. The resolved graph now passes `npm audit` with zero known vulnerabilities.

## Resource Analysis

- Initial production JS observed earlier in the work: about 303.66 KB minified, 95.20 KB gzip.
- Current production JS after the operating-ledger, privacy, handoff, CSV-mapping, campaign-history export, results-view, installer-version, and release-gate slices: 276.41 KB minified, 80.73 KB gzip.
- Current production CSS after removing external webfont references: 108.11 KB minified, 17.27 KB gzip.
- Final served public payload directory: about 338 KB, down from tens of MB because unused legacy public images/zips are no longer copied into production builds.
- Final installer: 33.0 MB, dominated by the embedded Node runtime.
- Runtime optimizations applied: removed unused app providers, deferred mentor search input, debounced localStorage writes, cleaned stale production public assets, made development debug logging opt-in, and bundled only the current server/runtime payload.

## Validation

- `npm run build`: passed.
- `npm run check`: passed.
- `npm run check:release`: passed.
- `npm audit`: passed with zero known vulnerabilities after lockfile and build-tool remediation.
- `node scripts/ngrok.mjs`: correctly fails fast here because ngrok is not installed on PATH.
- Safe installer run with `MARO_INSTALL_DIR`, `MARO_SKIP_SHORTCUTS=1`, `MARO_SKIP_REGISTRY=1`, and `MARO_SKIP_LAUNCH=1`: passed.
- Release smoke server: returned HTTP 200 for `/`, enforced restrictive CSP directives, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `Permissions-Policy`, and verified the root app shell had no external asset URLs, Google Fonts references, or development debug-collector injection.

## Remaining Risks

- ngrok still creates a public URL when available; use `NGROK_BASIC_AUTH` for shared or sensitive drafts.
- The installer is not Authenticode-signed and update checks are not implemented. Windows may show an unknown-publisher warning until a code-signing certificate and release channel are used.
- Mentor/contact data is encrypted at rest only when `MARO_LEDGER_PASSPHRASE` is configured. Workspace backups are portable JSON exports and should still be treated as sensitive files.
- The app now uses local system font stacks; no external webfont request is needed for normal rendering.

## Feature Improvements Worth Doing Next

Detailed prioritization and acceptance criteria are in `analysis/ENHANCEMENT_BACKLOG.md`.

- Template scoring and personalization checks before copying a message.
- Browser-extension form-fill handoff that keeps the final send action manual and reviewable.
- Ngrok status panel showing tunnel URL, auth status, and copy button.
- Authenticode-sign the installer and add signed-release update checks when certificate/release infrastructure exists.
