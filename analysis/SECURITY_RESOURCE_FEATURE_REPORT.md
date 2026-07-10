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
- Cross-site local API mutation risk: every mutating `/api` request now requires the non-simple `X-MARO-Request: 1` marker, cross-site browser fetch metadata is rejected, and no CORS access is granted. Normal same-origin reads remain marker-free.
- Production error disclosure: `ErrorBoundary` no longer shows stack traces outside development builds.
- Dev log ingestion DoS and resource-churn risk: the Vite debug collector is now disabled unless `MARO_DEBUG_COLLECTOR=1` is set, and still caps request payloads at 256 KB before writing logs when explicitly enabled.
- Ngrok access control: development and installed launchers refuse to create unauthenticated public tunnels by default. `NGROK_BASIC_AUTH` enables the normal protected flow; `MARO_ALLOW_PUBLIC_TUNNEL=1` is required for an intentional public override.
- Local ledger confidentiality: setting `MARO_LEDGER_PASSPHRASE` stores the ledger as an AES-256-GCM encrypted envelope instead of plaintext JSON.
- Shoulder-surfing reduction: session privacy mode hides mentor notes, draft bodies, response text, follow-up text, and delivery evidence until explicitly revealed.
- Manual handoff safety: review queues can open the stored mentor profile URL, but external copy/fill uses only a short-lived package built from the latest approved snapshot. Editing an approved draft invalidates approval before any handoff or send confirmation can proceed.
- Legacy extension exposure: removed two public ZIP archives that contained automated send/queue code, broad permissions, a placeholder remote API, and a no-op rate limiter. The replacement extension has no send capability, background worker, storage, persistent host access, or network client.
- Extension least privilege: the generated Manifest V3 package requests only user-triggered `activeTab`, `scripting`, and clipboard-write access, validates the active profile against the approved package, and falls back to copying rather than sending when form fill is unavailable.
- Profile handoff URL hardening: mentor profile links are retained only for `http` and `https`; unsafe or malformed schemes are removed during create, update, and backup normalization.
- Spreadsheet export hardening: CSV fields beginning with spreadsheet formula prefixes are neutralized before export so imported mentor content cannot become an active formula when opened in Excel.
- Scoring input bounds: skill, industry, and location lists are deduplicated and capped at 25 entries of 80 characters each before persistence or scoring.
- Discovery handoff privacy: generated queries remain local derived state, source launch URLs contain no query parameters or fragments, and adding recommendations creates only audited planned records without external requests.
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
- Current production JS with same-app mutation protection: 318.81 KB minified, 89.30 KB gzip.
- Current production CSS: 109.78 KB minified, 17.46 KB gzip.
- Final served public payload directory: 430.91 KiB, including the 11.91 KiB generated manual-handoff extension ZIP.
- Final installer: 33.1 MB, dominated by the embedded Node runtime.
- Runtime optimizations applied: removed unused app providers, deferred mentor search input, debounced localStorage writes, cleaned stale production public assets, made development debug logging opt-in, and bundled only the current server/runtime payload.
- Structured mentor scoring remains event-driven: existing profiles are recalculated only when campaign scoring inputs change, with no polling or background scoring process.
- Discovery plans are read-time derivations over the stored campaign and source ledger; applying them is idempotent and adds no dependency, timer, scraper, or background worker.
- The manual-fill extension runs only while its popup is open and does not install content scripts, retain a handoff package, poll, queue messages, or run a background worker.
- Read-only ledger routes no longer rewrite encrypted storage. A file-metadata-aware in-memory cache avoids repeated scrypt/decryption after the first read and returns cloned state to each request; explicit export routes still persist their required audit events.
- Same-app mutation protection is a constant-time header check with no token storage, timers, polling, extra network round trips for the same-origin app, or work on read-only requests.

Current encrypted-ledger QA sample on this Windows machine:

- Node working set: 66.21 MB; private memory: 31.01 MB; 12 threads.
- Twenty-five `GET /api/ledger/summary` fetches averaged 3.68 ms after warm-up, down from 78.99 ms before the read-path cache and persistence guard on the same machine.
- Smoke coverage verifies repeated read-only summary requests do not change the encrypted ledger bytes.
- These values are a development-machine snapshot rather than a cross-device performance guarantee; they are useful as a regression baseline for later paging or storage work.

## Validation

- `npm run build`: passed.
- `npm run check`: passed.
- `npm run check:release`: passed.
- `npm audit`: passed with zero known vulnerabilities after lockfile and build-tool remediation.
- API mutation security smoke: requests with a missing or incorrect `X-MARO-Request` marker returned HTTP 403, browser-reported cross-site mutations returned HTTP 403 even with the marker, no CORS access header was exposed, and normal marked mutations completed successfully.
- Production browser QA: a project mutation persisted through the rendered app, appeared in project controls, and produced no console errors or horizontal page overflow in desktop and mobile layout checks.
- `node scripts/ngrok.mjs`: refuses to open a tunnel when neither `NGROK_BASIC_AUTH` nor the explicit public override is configured.
- Safe installer run with `MARO_INSTALL_DIR`, `MARO_SKIP_SHORTCUTS=1`, `MARO_SKIP_REGISTRY=1`, and `MARO_SKIP_LAUNCH=1`: passed.
- Final installer SHA-256: `B385656182C6CE44D2B4C3176C7CC29FF687CA4A51436B4853938C51089DDA10`.
- Installer version `1.1.0` contains the generated manual-handoff extension, launcher, and uninstaller, and contains neither legacy automated-messaging archive.
- Release smoke server: returned HTTP 200 for `/`, enforced restrictive CSP directives, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and `Permissions-Policy`, and verified the root app shell had no external asset URLs, Google Fonts references, or development debug-collector injection.

## Remaining Risks

- An operator can still explicitly allow a public tunnel with `MARO_ALLOW_PUBLIC_TUNNEL=1`; this remains unsuitable for sensitive drafts without an additional access-control layer.
- The installer is not Authenticode-signed and update checks are not implemented. Windows may show an unknown-publisher warning until a code-signing certificate and release channel are used.
- Mentor/contact data is encrypted at rest only when `MARO_LEDGER_PASSPHRASE` is configured. Workspace backups are portable JSON exports and should still be treated as sensitive files.
- The app now uses local system font stacks; no external webfont request is needed for normal rendering.

## Feature Improvements Worth Doing Next

Detailed prioritization and acceptance criteria are in `analysis/ENHANCEMENT_BACKLOG.md`.

- Authenticode-sign the installer and add signed-release update checks when certificate/release infrastructure exists.
- Add pagination or table virtualization only after real campaign lists exceed a few hundred mentors.
