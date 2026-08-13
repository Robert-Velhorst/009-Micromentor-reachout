# MARO Security, Resource, and Feature Analysis

Date: 2026-08-09
Repository revision scanned: `codex/giant-goal-completion` working tree after the Giant Goal audit

## Scope

- Production app entrypoints: `client/src/App.tsx`, `client/src/pages/Home.tsx`, `client/src/main.tsx`, `server/index.ts`.
- Runtime and exposure path: `scripts/build.mjs`, `scripts/ngrok.mjs`, packaged `dist/index.cjs`, local HTTP server, ngrok launcher.
- Installer path: `scripts/build-windows-installer.mjs`, generated `artifacts/MARO-Windows11-Setup.exe`.
- Supporting surfaces: API client, active shadcn components, Vite config, release smoke, installer builder, and README.

## Threat Model

- The tool is a local outreach console that stores mentor/contact drafts in a local server-side ledger file.
- The largest trust-boundary change is ngrok exposure: local-only content can become reachable through a public tunnel.
- No server-side database, authentication backend, payment logic, or third-party API write path is active in the production app.
- Primary risks are accidental public exposure, browser-side data leakage, stale debug tooling, dependency/build drift, and installer tampering.

## Findings And Fixes

- Public bind risk: the server previously inherited a broad host stance. Fixed by defaulting production/server runs to `127.0.0.1`; ngrok now targets `http://127.0.0.1:<port>` explicitly.
- Missing browser hardening headers: added `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, and a restrictive CSP.
- Cross-site local API mutation risk: every mutating `/api` request now requires the non-simple `X-MARO-Request: 1` marker, cross-site browser fetch metadata is rejected, and no CORS access is granted. Normal same-origin reads remain marker-free.
- DNS-rebinding risk: every request now passes a fail-closed Host allowlist. Local hosts, exact `MARO_ALLOWED_HOSTS`, and only the launcher's exact current ngrok endpoint are accepted; another ngrok Host receives HTTP 421 even when tunnel authentication is configured.
- API parser and cache boundaries: mutation checks run before JSON parsing, JSON bodies are capped at 1 MB, API errors remain JSON, API responses use `no-store`, and only fingerprinted static assets receive immutable caching.
- Production error disclosure: `ErrorBoundary` no longer shows stack traces outside development builds.
- Dev log ingestion and resource-churn risk: the obsolete Vite debug collector and Vite-only runtime command were removed. Vite remains a build compiler only; normal development runs the built Express app through the guarded ngrok launcher.
- Ngrok access control: development and installed launchers refuse unauthenticated public tunnels by default. `NGROK_BASIC_AUTH` is enforced with current Traffic Policy rather than a deprecated command-line credential; the endpoint is target-matched across Agent API ports 4040-4050 and published through a short-lived exact Host file instead of trusting a domain suffix.
- Local ledger confidentiality: setting `MARO_LEDGER_PASSPHRASE` stores the ledger as an AES-256-GCM encrypted envelope. Windows installation generates a DPAPI-protected per-user key automatically, and Docker Compose refuses to start without a passphrase.
- Shoulder-surfing reduction: session privacy mode hides mentor notes, draft bodies, response text, follow-up text, and delivery evidence until explicitly revealed.
- Manual handoff safety: review queues can open the stored mentor profile URL, but external copy/fill uses only a short-lived package built from the latest approved snapshot. Editing an approved draft invalidates approval before any handoff or send confirmation can proceed.
- Legacy extension exposure: removed two public ZIP archives that contained automated send/queue code, broad permissions, a placeholder remote API, and a no-op rate limiter. The replacement extension has no send capability, background worker, storage, persistent host access, or network client.
- Extension least privilege: the generated Manifest V3 package requests only user-triggered `activeTab`, `scripting`, and clipboard-write access, validates the active profile against the approved package, and falls back to copying rather than sending when form fill is unavailable.
- Profile handoff URL hardening: mentor profile links are retained only for `http` and `https`; unsafe or malformed schemes are removed during create, update, and backup normalization.
- Spreadsheet export hardening: CSV fields beginning with spreadsheet formula prefixes are neutralized before export so imported mentor content cannot become an active formula when opened in Excel.
- Scoring input bounds: skill, industry, and location lists are deduplicated and capped at 25 entries of 80 characters each before persistence or scoring.
- Discovery handoff privacy: generated queries remain local derived state, source launch URLs contain no query parameters or fragments, and adding recommendations creates only audited planned records without external requests.
- Failure transparency: failed manual send attempts are audit logged and remain retryable instead of being hidden, converted into sent state, or allowed to schedule follow-ups.
- Outbound safety: durable do-not-contact state, identity cooldown, operator/environment pause, and uncertain-delivery resolution now fail closed at the server as well as in the UI.
- API resilience: request IDs, conservative local rate limiting, and ten-minute server-side mutation replay prevent accidental duplicates and make failures traceable.
- Deployment integrity: the broken static nginx image was replaced with a non-root Express container, persistent data volume, readiness healthcheck, read-only root filesystem, and dropped Linux capabilities.
- Low-cognitive-load operations: dashboard next actions now open the relevant campaign tab directly and preserve mentor context where available, reducing manual navigation during review, follow-up, billing, and outcome work.
- Project-linked integrity: campaign creation and updates now validate project IDs, and the command center exposes project creation plus campaign project assignment so outreach stays tied to the correct broader goal.
- Installer dependency, upgrade, and removal risk: the Windows installer embeds Node, separates durable data from replaceable binaries, migrates legacy data without overwriting conflicts, installs atomically, protects its random ledger key with DPAPI, validates process ownership and full exit before stop/upgrade/uninstall, retries transient directory locks, and retains workspace data on uninstall.
- Static surface drift: removed the inactive parallel `src/` frontend and unused UI modules; both client and server TypeScript contracts now pass.
- Release regression risk: `npm run check:release` now covers TypeScript, encrypted API/adversarial smoke, production surfaces, a seeded legacy-data migration, configuration-triggered restart, installed encrypted runtime launch/stop, in-use upgrade, and byte-identical ledger/key preservation.
- External font privacy: removed Google Fonts preconnect/stylesheet requests and tightened CSP font/style directives back to self-only sources plus inline styles required by the bundled UI.
- Production surface regression risk: the encrypted-ledger smoke test now fails if the root app shell reintroduces external production asset URLs, Google Fonts references, development debug-collector injection, missing browser hardening headers, or weakened CSP directives.
- Workspace restore integrity: restore validation now requires message-quality and invoice-record arrays, preventing accepted backups from silently dropping review or billing-report history.
- Outreach control integrity: campaign-level tone and follow-up timing are persisted and used for generated drafts plus automatic follow-up suggestions after manual send confirmation, keeping workflow automation aligned with the operator's configured rules. Negative responses now cancel pending follow-ups instead of leaving accidental outreach work queued. Duplicate outreach guards now block active or sent campaign drafts for the same mentor identity/profile URL, including manual duplicate mentor records, and next actions identify duplicate profiles for operator review.
- Relationship history integrity: mentor timelines are now derived from persisted server-side ledger records, are available through a dedicated local API route, and keep delivery evidence or failed-send details behind the existing privacy reveal controls instead of duplicating that derivation in the browser. The command center loads only the selected mentor's timeline so normal campaign refreshes do not serialize every contact's full history.
- Dependency supply-chain integrity: added an npm lockfile for reproducible installs, applied non-breaking audit remediations, and upgraded the build-only Vite/esbuild toolchain to patched releases. The resolved graph now passes `npm audit` with zero known vulnerabilities.
- Ledger durability: writes now use synchronized temporary files and atomic replacement. A rolling backup supports audited recovery from a corrupt primary file.
- Restore referential integrity: backup preview now rejects duplicate IDs and orphaned links across projects, campaigns, mentors, messages, responses, follow-ups, resources, billing, invoices, and outcomes.
- Workflow input integrity: response classifications and dates are validated, and response/follow-up message references must belong to the same campaign and mentor.
- HAI least authority: the optional connector emits only read-only `hai.generic_json_feed.v1` next-action cards, omits message and response bodies, supports conditional reads, is disabled by default, and exposes no approval, send-confirmation, or provider-write authority.
- Docker build efficiency: generated caches and private environment files are excluded from the context. The measured changed-source transfer fell from 342.91 MB to 806.21 KB; a cached no-change pass transferred 3.52 KB without changing the runtime image.

## Resource Analysis

- Initial production JS observed earlier in the work: about 303.66 KB minified, 95.20 KB gzip.
- Current production JS: 324.76 KB minified, 90.55 KB gzip.
- Current production CSS: 39.84 KB minified, 7.56 KB gzip, down from 109.78 KB and 17.46 KB gzip.
- Final served public payload directory: 377,717 bytes across four files.
- Current installer remains about 33.1 MB, dominated by the embedded Node runtime; the exact frozen byte count is recorded in the final verification report.
- Runtime optimizations applied: removed unused app providers, inactive frontend, development debug collector, and Vite-only server path; deferred mentor search input, debounced localStorage writes, removed 59,633,295 bytes of unreachable images, cached ledger reads, and bundled only the current server/runtime payload.
- Structured mentor scoring remains event-driven: existing profiles are recalculated only when campaign scoring inputs change, with no polling or background scoring process.
- Discovery plans are read-time derivations over the stored campaign and source ledger; applying them is idempotent and adds no dependency, timer, scraper, or background worker.
- The manual-fill extension runs only while its popup is open and does not install content scripts, retain a handoff package, poll, queue messages, or run a background worker.
- Read-only ledger routes no longer rewrite encrypted storage. A file-metadata-aware in-memory cache avoids repeated scrypt/decryption after the first read and returns cloned state to each request; audited exports are guarded POST operations.
- Same-app mutation protection is a constant-time header check with no token storage, timers, polling, extra network round trips for the same-origin app, or work on read-only requests.
- Initial UI refresh uses one aggregate dashboard request instead of seven ledger requests. Exact concurrent requests are coalesced, and runtime/ngrok status is probed only on initial load or explicit refresh.

Current packaged-runtime sample on this Windows machine:

- Production Node working set: 51.54 MiB; private memory: 32.06 MiB; 12 threads.
- Fifty `GET /api/dashboard` requests measured 31.28 ms median and 51.44 ms p95 through Windows PowerShell HTTP overhead.
- The encrypted QA ledger was 4,523 bytes and the dashboard response was 18,051 bytes.
- Smoke coverage verifies repeated read-only summary requests do not change the encrypted ledger bytes.
- These values are a development-machine snapshot rather than a cross-device performance guarantee; they are useful as a regression baseline for later paging or storage work.
- Hardened Docker idle sample: 0.05% CPU, 19.5 MiB memory, and 11 processes after readiness, health, app-shell, and HAI feed requests.

## Validation

- `npm run build`: passed.
- `npm run check`: passed.
- `npm run check:release`: passed.
- `npm audit`: passed with zero known vulnerabilities after lockfile and build-tool remediation.
- API mutation security smoke: requests with a missing or incorrect `X-MARO-Request` marker returned HTTP 403, browser-reported cross-site mutations returned HTTP 403 even with the marker, no CORS access header was exposed, and normal marked mutations completed successfully.
- Production browser QA: onboarding and pause/DNC mutations persisted, with no console errors, incoherent overlay, or horizontal page overflow at desktop width or the in-app browser's effective 520 px mobile viewport.
- `node scripts/ngrok.mjs`: refuses to open a tunnel when neither `NGROK_BASIC_AUTH` nor the explicit public override is configured.
- Live ngrok acceptance: a dedicated HTTPS endpoint on alternate inspector port 4042 returned 401 without credentials and 200 for authenticated UI and read-only HAI requests; its exact Host returned 200, another ngrok Host returned 421, and teardown removed the endpoint, listener, allowlist, and policy file.
- Isolated Windows installer migration, DPAPI encryption, configuration restart, owned-process shutdown, stopped and in-use upgrade preservation: passed.
- Final installer size: 34,676,224 bytes (33.07 MiB); SHA-256: `3A538D668310D6489511DF0DF2839EF9E17D6C4B7B36B46E0AE01026F661A70A`.
- Compute and publish a fresh SHA-256 checksum for each later release; the self-extracting executable is regenerated by the release gate.
- Installer version `1.2.2` contains the generated manual-handoff extension, launcher, stop helper, and uninstaller, and contains neither legacy automated-messaging archive.
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
