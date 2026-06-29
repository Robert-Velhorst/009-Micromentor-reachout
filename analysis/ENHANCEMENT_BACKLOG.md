# MARO Enhancement Backlog

Date: 2026-05-27
Scope: current `client/src/pages/Home.tsx` production app, legacy feature pages in `src/pages`, ngrok launcher, Windows installer, and prior security/resource analysis.

## Current Product Shape

MARO is currently a local-first single-page outreach console. It manages mentor rows, personalizes a reusable message template, builds a manual review queue, copies or exports drafts, and shows lightweight progress/resource/value estimates. Work persists partly through browser `localStorage`; generated queue state and send outcomes are session-only.

The best next enhancements should make the tool more useful for repeated real outreach without turning it into an automated spam sender or weakening the local-first security posture.

## Priority Backlog

### P0 - Campaign History And Outcome Tracking

Problem: MARO can mark messages as sent, but completed queue state is not durable and outcomes are too coarse for real follow-up work.

Build:
- Persist campaign runs, message status, sent timestamp, and selected template variables.
- Add outcome states: queued, copied, sent, replied, booked, declined, follow-up due, archived.
- Add per-mentor notes and next follow-up date.
- Add a results view that shows response rate, booking rate, and overdue follow-ups.

Acceptance:
- Refreshing the browser keeps the active campaign and statuses.
- A user can filter by follow-up due and update outcome state without rebuilding the queue.
- Export includes status, sent date, outcome, and notes.

Why first: this turns MARO from a draft generator into a repeatable outreach workflow.

Status: Implemented in the operating-ledger branch with persisted campaigns, mentor stages, message statuses, responses, follow-ups, outcomes, deterministic next-action recommendations, campaign-history export, and a results view for response rate, booking rate, positive outcome rate, overdue follow-ups, outcome filters, and inline outcome updates.

### P0 - Robust CSV Import, Export, And Deduplication

Problem: bulk import currently splits pasted rows on commas, which breaks quoted CSV values and gives no validation or duplicate warning.

Build:
- Add file import for `.csv`.
- Support column mapping for name, company, role, goal, URL/profile, notes, priority, and stage.
- Detect duplicates by normalized name plus company/profile URL.
- Show import preview with valid rows, skipped rows, and warnings.
- Export mentors and campaign history as CSV.

Acceptance:
- Quoted commas and blank optional fields import correctly.
- Duplicate rows are not silently added.
- The user can export data and re-import it without losing core fields.

Why first: real MicroMentor workflows usually start with a list, not manual row entry.

Status: Implemented in the operating-ledger branch. CSV parsing supports quoted values, import preview, duplicate/missing-name skips, mentor export, `.csv` file loading in the command center, configurable source-column mapping for name/company/role/goal/profile/notes/priority/stage/source, campaign-history CSV export with message status, send timestamp, response, follow-up, outcome, and notes, plus API smoke coverage for mapped headers and history export.

### P1 - Template Quality Checks

Problem: the template editor accepts any text. Broken variables, missing personalization, overly long drafts, and weak calls to action are only visible after manual review.

Build:
- Validate unsupported `{tokens}` and missing recommended tokens.
- Show subject/body length, reading time, and per-message personalization coverage.
- Flag repetitive messages, empty variables, and call-to-action gaps.
- Add template variants for first touch, follow-up, thank-you, and reactivation.

Acceptance:
- Invalid variables are highlighted before queue build.
- The preview shows which fields were substituted for the selected mentor.
- Queue build can continue with warnings, but not with structurally broken variables.

Why now: it improves quality without adding risk or heavy dependencies.

Status: Implemented in the operating-ledger branch with persisted per-draft quality reviews, unresolved-token approval blocking, length/reading-time/personalization/call-to-action checks, review-queue UI warnings, and smoke-test coverage.

### P1 - Ngrok Status And Exposure Controls

Problem: the default runtime can expose the app through ngrok, but the UI does not show whether the app is local-only, tunneled, or protected by basic auth.

Build:
- Add a small runtime status endpoint for local host, port, environment, and tunnel metadata when available.
- Show local URL, tunnel URL, and auth status in the app header or settings panel.
- Warn when ngrok is public and `NGROK_BASIC_AUTH` is not set.
- Add one-click copy for local/tunnel URLs.

Acceptance:
- The user can tell whether the app is private local mode or publicly reachable.
- The app visibly warns before sensitive local data is exposed without tunnel auth.
- No external tunnel API is contacted from the browser directly.

Why now: this directly supports the user-requested ngrok direction and reduces accidental exposure.

Status: Implemented in the operating-ledger branch with `GET /api/runtime/status`, a dashboard runtime exposure panel, copy actions for local/tunnel URLs, UI warning for public unauthenticated tunnels, launcher warning when `NGROK_BASIC_AUTH` is missing, and smoke-test coverage.

### P1 - Local Workspace Backup, Restore, And Reset

Problem: localStorage persistence is convenient but opaque. Browser cleanup, profile changes, or installer migration can lose work.

Build:
- Add backup export as JSON with schema version.
- Add restore import with migration and validation.
- Add reset options for queue only, mentor data only, or full workspace.
- Keep the current local-first model; do not require cloud sync.

Acceptance:
- A backup from one install restores on another install.
- Invalid backup files are rejected with a clear error.
- Reset actions require confirmation and target only the chosen data scope.

Why now: this is a low-complexity reliability improvement.

Status: Implemented in the operating-ledger branch with schema-versioned JSON export, restore preview validation, confirmed restore, queue/mentor/workspace reset scopes, audit events, UI controls in the Audit tab, and smoke-test coverage.

### P1 - Privacy Mode And Optional Local Encryption

Problem: mentor/contact data and drafts are readable in the local ledger when encryption is not configured. This is acceptable for local prototypes, but weaker for real outreach data.

Build:
- Add privacy mode that hides message bodies and notes until revealed.
- Add optional passphrase-based encryption for stored workspace data.
- Add clear messaging that forgotten passphrases cannot be recovered.

Acceptance:
- Stored mentors, messages, notes, and campaign history are encrypted when `MARO_LEDGER_PASSPHRASE` is configured.
- The command center can hide sensitive visible text until the operator reveals a specific item.
- Existing unencrypted data can be migrated deliberately.

Why now: useful before users put sensitive mentor notes into the tool.

Status: Implemented for the local-first operating ledger. Server-side ledger encryption is available with `MARO_LEDGER_PASSPHRASE`; the local file is stored as an AES-256-GCM encrypted envelope and the full API smoke run verifies no plaintext mentor/campaign names are written to disk. The command center now defaults to session privacy mode and hides mentor notes, draft bodies, responses, follow-ups, and send evidence until explicitly revealed.

### P2 - MicroMentor Profile Handoff

Problem: MARO prepares messages but does not connect recipient records to the source MicroMentor profile or final manual send step.

Build:
- Add mentor profile URL field.
- Add "open profile" action beside each queued draft.
- Support a browser-extension handoff that fills or copies a draft while leaving the final send action manual.
- Store the profile URL in exports and campaign history.

Acceptance:
- Each queued message can open its corresponding profile.
- The handoff never auto-sends.
- Failed handoff falls back to copy-to-clipboard.

Why later: strong workflow improvement, but it needs careful compliance and browser-extension QA.

Status: First local handoff slice implemented in the operating-ledger branch. Review queues now show manual profile handoff controls for each draft, can open the stored source profile URL, and can copy the reviewed subject/body to the clipboard only after the draft body is visible in privacy mode. Final send remains outside MARO and still requires manual confirmation evidence before the ledger marks a message sent. Browser-extension form filling remains future work.

### P2 - Installer Signing, Updates, And Uninstall Path

Problem: the current Windows installer works, but it is unsigned and has no update or uninstall flow.

Build:
- Authenticode-sign the installer and installed launcher when a certificate is available.
- Add version metadata to the installer and installed app.
- Add Start Menu uninstall shortcut or proper Add/Remove Programs registration.
- Add optional update check that downloads only signed releases.

Acceptance:
- Windows shows a known publisher after signing.
- Installed version is visible in the app and README/install metadata.
- User can remove MARO without manually deleting `%LOCALAPPDATA%\MARO`.

Why later: important for distribution trust, but requires certificate/release infrastructure.

Status: Partially implemented in the operating-ledger branch. The installer writes installed-version metadata, exposes the app version through `GET /api/runtime/status` and the command center, creates a Start Menu uninstall shortcut, and registers a current-user Add/Remove Programs uninstall entry. Authenticode signing and signed update checks still require certificate and release infrastructure.

### P2 - Test Coverage And Release Gates

Problem: current validation relies mostly on typecheck/build/manual installer tests. The app has enough workflow logic to justify focused automated tests.

Build:
- Add unit tests for personalization, CSV parsing, duplicate detection, and persistence migrations.
- Add component tests for queue build, status changes, import preview, and export.
- Add a smoke test for server headers and local route serving.
- Add a documented release checklist for installer validation.

Acceptance:
- Core outreach logic can be changed without manual regression testing every path.
- CI or local release command blocks on typecheck, unit tests, build, and server smoke test.

Why later: valuable once the next feature slice introduces more state transitions.

Status: Implemented as a local release gate. `npm run check:release` now runs the TypeScript contract check, production build plus encrypted-ledger API smoke test, production surface checks for CSP/security headers and external asset regressions, and the Windows installer build on Windows hosts. The smoke test covers root route serving, restrictive CSP, browser hardening headers, no external production asset URLs in the app shell, CSV parsing/import/export, mapped headers, duplicate skips, template quality blocking, approval-before-send enforcement, follow-up state transitions, response/outcome tracking, billing records, invoice report generation, backup/restore/reset validation, encryption-at-rest, and next-action coverage including invoice-report recommendations.

## Resource Usage Enhancements

Done:
- Persisted local invoice/usage-report records generated from stored billing records. Invoice reports are audit logged, included in workspace backup/restore/reset summaries, and explicitly documented as local records rather than external charges.
- Removed Google Fonts requests and switched to local system font stacks so private/offline installs do not contact external font hosts during normal rendering.
- Added production surface assertions to the release gate so root HTML, CSP, browser hardening headers, and external asset regressions are checked before installer builds.

Do next:
- Virtualize mentor and queue tables only after real lists exceed a few hundred rows. The current UI does not need virtualization yet.
- Move CSV parsing and backup restore validation into chunked browser work if files become large.
- Keep generated messages derived with `useMemo`; persist only durable campaign snapshots, not every keystroke.
- Remove or quarantine unused legacy `src/` app code once no longer needed as reference. It increases dependency pressure and code-review noise.

Avoid for now:
- Background polling resource monitors. The old `src/pages/Dashboard.jsx` model simulates usage and adds runtime churn without improving the current end-user workflow.
- Heavy charting for outreach metrics until campaign history exists.
- Shipping large binary artifacts in git. Keep installers as release artifacts.

## Security Enhancements

Done:
- Added ngrok exposure status and unauthenticated tunnel warning.
- Added JSON backup validation and schema versioning before restore.
- Added optional passphrase-based encrypted local ledger storage for sensitive mentor, message, and campaign data.
- Added UI privacy mode to hide sensitive command-center text until revealed.
- Added manual profile handoff controls that copy revealed drafts without introducing automated external sending.
- Added release-gate checks that fail on missing security headers, weakened CSP self-only directives, Google Fonts reintroduction, or external asset URLs in the production app shell.

Do next:
- Keep CSP self-only for production assets unless a future integration has an explicit privacy review and documented need.

Avoid for now:
- Automated sending to MicroMentor. It creates account, consent, rate-limit, and platform-policy risk. Keep final send manual until rules and safeguards are explicit.
- Cloud sync without authentication, encryption, and data-retention decisions.

## Suggested Implementation Slices

1. Campaign persistence plus outcome tracking.
2. CSV import/export with duplicate detection.
3. Template quality checks.
4. Ngrok status and workspace backup/restore.
5. Privacy reveal mode, profile handoff, and installer signing/update work.

The first two slices deliver the largest practical improvement with limited architectural risk.
