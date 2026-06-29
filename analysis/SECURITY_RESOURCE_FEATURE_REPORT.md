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
- Dev log ingestion DoS risk: the Vite debug collector now caps request payloads at 256 KB before writing logs.
- Ngrok access control: launcher supports optional `NGROK_BASIC_AUTH` so a tunnel can require basic auth.
- Local ledger confidentiality: setting `MARO_LEDGER_PASSPHRASE` stores the ledger as an AES-256-GCM encrypted envelope instead of plaintext JSON.
- Shoulder-surfing reduction: session privacy mode hides mentor notes, draft bodies, response text, follow-up text, and delivery evidence until explicitly revealed.
- Manual handoff safety: review queues can open the stored mentor profile URL and copy the revealed reviewed draft, but the app still does not automate external sending.
- Installer dependency and removal risk: the Windows installer embeds the Node runtime and built app, so the end user does not need a separate Node/npm install; it also writes installed-version metadata and registers a current-user uninstall entry.
- Static type drift: fixed legacy `Map`, `calendar`, and `usePersistFn` type errors; `npm run check` now passes.
- Release regression risk: added `npm run check:release` to run TypeScript checks, the production encrypted-ledger API smoke test, and the Windows installer build on Windows hosts.

## Resource Analysis

- Initial production JS observed earlier in the work: about 303.66 KB minified, 95.20 KB gzip.
- Current production JS after the operating-ledger, privacy, handoff, CSV-mapping, campaign-history export, results-view, and installer-version slices: 276.41 KB minified, 80.73 KB gzip.
- Current production CSS: 107.92 KB minified, 17.24 KB gzip.
- Final served public payload directory: about 338 KB, down from tens of MB because unused legacy public images/zips are no longer copied into production builds.
- Final installer: 33.0 MB, dominated by the embedded Node runtime.
- Runtime optimizations applied: removed unused app providers, deferred mentor search input, debounced localStorage writes, cleaned stale production public assets, and bundled only the current server/runtime payload.

## Validation

- `npm run build`: passed.
- `npm run check`: passed.
- `npm run check:release`: passed.
- `node scripts/ngrok.mjs`: correctly fails fast here because ngrok is not installed on PATH.
- Safe installer run with `MARO_INSTALL_DIR`, `MARO_SKIP_SHORTCUTS=1`, `MARO_SKIP_REGISTRY=1`, and `MARO_SKIP_LAUNCH=1`: passed.
- Installed test server on `127.0.0.1:3103`: returned HTTP 200 with CSP, `X-Frame-Options: DENY`, and `X-Content-Type-Options: nosniff`.

## Remaining Risks

- ngrok still creates a public URL when available; use `NGROK_BASIC_AUTH` for shared or sensitive drafts.
- The installer is not Authenticode-signed and update checks are not implemented. Windows may show an unknown-publisher warning until a code-signing certificate and release channel are used.
- Mentor/contact data is encrypted at rest only when `MARO_LEDGER_PASSPHRASE` is configured. Workspace backups are portable JSON exports and should still be treated as sensitive files.
- Google Fonts remain external; privacy-sensitive/offline installs could self-host fonts later.

## Feature Improvements Worth Doing Next

Detailed prioritization and acceptance criteria are in `analysis/ENHANCEMENT_BACKLOG.md`.

- Template scoring and personalization checks before copying a message.
- Browser-extension form-fill handoff that keeps the final send action manual and reviewable.
- Ngrok status panel showing tunnel URL, auth status, and copy button.
- Authenticode-sign the installer and add signed-release update checks when certificate/release infrastructure exists.
