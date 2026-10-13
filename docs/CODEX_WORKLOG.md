# Codex Worklog

## 2026-10-13 Responsive Controls And Zoom

1. Traced the apparent mobile-width mismatch to browser page zoom and verified actual CSS viewport width/zoom through tab-scoped device metrics.
2. Fixed narrow overview and mentor-detail overflow; wrapped long Dutch confirmation/export/support and approved-draft actions within their containers. Removed the HTML zoom restriction.
3. Added regression checks for the viewport declaration and wrapping classes while retaining existing workflow/privacy callback assertions.
4. Activated all six tabs in English and Dutch at verified CSS widths 320, 390, 768 and 1440. All 48 document-width and direct button-container checks passed. Visually inspected synthetic Dutch review states at 320 and 1440; privacy-off review at 320 also passed. No browser warnings/errors were observed. No physical device or screen reader was used.
5. `npm run check:localization` passed. Final pinned Node 22.23.2 Windows `npm run check:release` passed in `artifacts/release-check-responsive-final-2026-10-13.log`, including zero reported dependency vulnerabilities, API/storage/connection/extension/ngrok fixtures and fresh/in-use installer upgrades with portable recovery. The local unsigned 33,681,408-byte installer SHA-256 is `831A5D847449C101007DAA3BA21C5645BBDC8D9FAE72432D966754E53E9B9DDE`.
6. Browser-responsive and installer evidence is recorded in `docs/LOCALIZATION_VALIDATION.md` and `docs/PRODUCTION_READINESS.md`. Whole-product release acceptance is still open for the installed extension, clean Windows machine/account, live installed ngrok outages/I/O, independent security assessment, complete Dutch translation/accessibility, sustained pilot and publisher signing/distribution. No provider send or public tunnel was run.

## 2026-10-13 Review, Response And Billing Localization

1. Added 97 paired messages (442 total) for review, message quality, manual handoff controls, response/result filters, follow-ups and local cost/invoice reports. Reused existing typed status labels; persisted enums, approved content, exact API IDs and audit notes remain unchanged. Billing formats follow the locale and resource values retain eight decimal places.
2. Added accessible input names and privacy-button names/tooltips. Fixed a new failed-attempt note remaining visibly readable in privacy mode by adding masking and explicit reveal/hide. Renamed Response inbox to Recorded responses so the local records do not imply a connected provider inbox.
3. Added actual-tab/component tests for both languages, ordinary/empty/blocked/edited/hidden states, record escaping, unchanged enums and edits, approval/copy/confirmation guards, precise amounts and action callbacks. Existing delivery-control tests retain safety assertions with Dutch labels. All locale tests pass.
4. Browser tests in a fresh encrypted workspace verified draft subject, failure note and response classification/body survive language changes. Local approval retained the exact subject; the Dutch response command saved the exact reply behind privacy controls. Cost and invoice generation worked with local decimal notation, and the Dutch preference/invoice survived reload. No actual sending, provider calls or payments occurred. The owned tab/server were stopped and no warning/error logs were returned.
5. A 390x844 viewport request yielded an observed width of 780, so the non-overflowing controls at that width are not mobile or visual acceptance. Reset the override. Generated explanations, handoff notices, other operational panels and the extension remain translation work.
6. Full pinned-runtime Windows release gate passed in `artifacts/release-check-workflow-locale-2026-10-13.log`, including audit, contracts, 36 client scenarios, storage tests, 29 source-launcher cases, 32 Windows function checks, installed upgrades and fresh-key recovery. Installer: 33,681,408 bytes, unsigned, SHA-256 `78AE90BEA98CDA1A7ABA4D615825A8D3AAE375E323A71DE621619509DC867F07`. The 105.63 kB gzip bundle adds 2.09 kB; no new dependency, poller or translation request.
7. Updated README and acceptance evidence. Predecessor `d12b681` CI remained queued when checked; this new revision needs its own successful CI. No main merge or public release. Whole-product production readiness remains open.

## 2026-10-13 Navigation After Slow Actions

1. Reproduced an old mutation callback starting a new load for its captured campaign after navigation. Prior request-order protection could not reject this new request. Red evidence: `artifacts/check-navigation-before-2026-10-13.log`.
2. Scoped action completion to the originating view revision. Tab/campaign/recommendation navigation and campaign creation supersede old callbacks. Guarded form/report resets and post-write refreshes preserve newer views; notices retain successful/unknown outcomes. Delivery failures still propagate to the reconciliation controls. Writes are not cancelled or retried.
3. Added actual-handler tests for current/stale mutations, mentor/project/campaign forms, billing reports, late action navigation, delivery failures, campaign creation superseding an old save and navigation during an automatic refresh. Existing loading tests now reject obsolete automatic errors as well as snapshots. The 345-entry localization gate includes these regressions.
4. Browser tests on disposable encrypted data verified a held successful acknowledgement, a lost HTTP 200 acknowledgement, and an old automatic refresh arriving after campaign B. New tabs, campaign choice and unsaved input survived. Explicit refresh recovered saved projects without duplicate writes. Final rebuilt assets passed ordinary form reset and the Dutch delayed-save case. Interception was removed and the owned tab/server stopped; no provider traffic or public tunnel.
5. Full Windows release gate passed in `artifacts/release-check-navigation-2026-10-13.log`, including installer upgrades and recovery with an independent key. The unsigned installer is 33,679,360 bytes, SHA-256 `B8049F7DFB3C33370AA68E241AC8587598F69F1B09C1E6C918305D8E7ADF9BBE`. Client JavaScript is 103.54 kB gzip, 0.55 kB above the predecessor; no sustained-performance claim.
6. README and validation/readiness evidence document the exact scope. Cross-window synchronization, same-view concurrent edits, comprehensive visual/accessibility acceptance and the broader live/clean-machine/security/distribution gates remain open. Predecessor `88bb0f2` CI was still queued when checked; the pushed revision requires its own successful CI.

## 2026-10-13 Dashboard Read Consistency

1. Reproduced two real regressions: an older dashboard completion replaced newer campaign/safety state and erased a newly typed draft; a post-write dashboard GET reused an older in-flight response. The pre-fix failures are in `artifacts/check-dashboard-refresh-before-2026-10-13.log` and `artifacts/check-read-epoch-before-2026-10-13.log`.
2. Generalized settings-only read epochs to all GET/HEAD requests, invalidating on distinct write start and settlement, including lost acknowledgements. Identical pending writes still coalesce and are counted once. Added a read-state snapshot for Home; no automatic retries, polling, dependency or storage migration.
3. Home applies only its latest stable read. Older results/errors cannot overwrite data, guards, edits or loading state. Reads spanning a write request explicit refresh without applying their snapshot. Ordinary refreshes do not restore captured runtime metadata; unmount invalidates pending loads.
4. Added actual Home-handler completion-order tests and seven real-HTTP cases, bringing the client suite to 36 scenarios. Existing settings/restore/reset, timeout, cleanup and language tests pass; the message catalog has 343 paired entries.
5. In a fresh synthetic browser workspace, response-stage interception proved old-before-write responses cannot undo new uncertainty or verified resolution. Unsaved subject input survived a late older result. A late campaign A response could not replace newly created campaign B. A combined HTTP 200 write-acknowledgement loss plus stale dashboard preserved the block, required refresh and recovered one saved attempt. The disabled language menu was not forced. Interception was cleared and the owned browser/server stopped; no real message or public tunnel.
6. Full pinned-runtime Windows release checks passed in `artifacts/release-check-dashboard-races-2026-10-13.log`, including installer upgrades and fresh-key recovery. Installer hash/signature and bounded proof/limitations are documented. The bundle increased by 0.23 kB gzip, with no sustained-performance claim. Existing branch predecessor CI remained queued when checked; the new revision requires its own CI. Cross-window coordination, stale mutation-callback navigation and the broader live/clean-machine/security gates remain open.

## 2026-10-13 Uncertain Delivery Guard And Reconciliation

1. Added workspace-wide uncertainty state and a server guard across directly matching identity IDs/nonempty normalized profile URLs, including other campaigns and zero cooldown. New drafts, approvals, handoffs and confirmed sends fail closed while unresolved. The original approved content cannot be edited/rejected; confirmed resolution requires its exact approval snapshot and preserves other safety gates.
2. Exposed record/resolve controls in Review with verification notes, an explicit outcome/checkbox, repeat-click suppression and refresh-before-retry after an unknown save. Dashboard warnings, campaign readiness and recommendations request reconciliation. Failed resolution releases only its uncertainty; confirmed resolution updates the original attempt and schedules one follow-up.
3. Added regressions for cross-campaign/URL aliases, unrelated handoff, byte-identical rejected writes, restore preservation, changed legacy approval, blank notes, pause and replay. The original API check failed before the guard existed. Actual component/handler tests cover both locales, required inputs, command arguments, duplicate clicks, retained notes and disabled copy/fallback behavior.
4. Browser checks with synthetic mentors exercised approval, uncertainty, failed and confirmed resolution, locale/input preservation and persisted history. Found and fixed verification-note exposure in the legacy failed-attempt display; its new test failed before the repair. Copy fallbacks now also hide when their draft is hidden. The mentor count now explicitly says Send attempts / Verzendpogingen. The catalog has 342 paired messages.
5. Two controlled browser CDP response failures occurred after the local server returned HTTP 200: recording uncertainty and confirming its resolution. Notes remained intact, retries were disabled, explicit refresh recovered the saved result, and reload showed one attempt and one follow-up. Interception was cleared. This is not real-ngrok/installed-extension or arbitrary network-loss acceptance. Screenshot capture was blank; no visual acceptance is claimed.
6. Final pinned-runtime Windows release gate passed in `artifacts/release-check-delivery-accepted-2026-10-13.log`, including dependency audit, both contracts, API/component tests, 29 client cases, storage checks, 29 source-launcher cases, 32 Windows function cases and installed upgrades/fresh-key recovery. Installer hash/signature are recorded in `PRODUCTION_READINESS.md`. The client bundle is 102.76 kB gzip, 2.05 kB above the previous mentor-detail build; no new dependency or background polling was added.
7. Updated README and dedicated validation/readiness documents, checked relative links and stopped the owned browser/server. No real messages, public tunnel, main merge, signing purchase or public release. Latest predecessor `e0f6c3a` CI was still queued when checked; this patch requires its own CI result. Full production-readiness scope remains open.

## 2026-10-13 Mentor Details And Truthful Delivery Timeline

1. Added 67 paired English/Dutch messages for mentor-detail controls/statuses, timeline categories and shared privacy buttons (322 total). Detail/timeline dates use the selected locale. Operator records, approved text and generated assessments/timeline descriptions are not translated or mutated.
2. Added actual-component tests for EN/NL rendering, empty/unselected states, local dates, escaped records, private text absent from hidden markup, revealed/privacy-off states and exact draft/duplicate/reveal/hide callbacks. The suite runs in the existing localization/release gate without another runtime dependency.
3. Browser interaction checks in a fresh isolated workspace verified Dutch details, note visibility across language changes, hiding, detail-panel draft creation and persisted locale after reload. No console warnings/errors were reported. The owned tab and server were stopped. This is not visual/mobile/accessibility acceptance.
4. An API regression reproduced a real timeline defect: uncertain sends were labeled failed and retryable. Uncertainty now has distinct warning text/tone and private context; explicit failed resolution updates the timeline. The initial failing test is in `artifacts/check-timeline-uncertain-before-2026-10-13.log`.
5. Further review found an open production blocker: uncertain attempts are not an identity-wide contact gate and the review UI does not expose the existing record/resolve APIs. Documented this explicitly in README and production readiness; completing that end-to-end reconciliation path is the next priority, not claimed fixed by the timeline change.
6. Full pinned-runtime local release checks passed in `artifacts/release-check-mentor-detail-2026-10-13.log`, including the regression, dependency audit, contracts, 29 client cases, storage/launcher checks, installer upgrades and independent-key recovery. The local installer remains unsigned. The preceding commit's GitHub run was still queued when checked; no predecessor CI success is claimed for this patch.

## 2026-10-13 Compact Dashboard Audit Payload

1. Added opt-in `auditDetail=summary` to the dashboard API and enabled it in the UI. Only audit `beforeState`/`afterState` snapshots are omitted; legacy default/full requests, audit metadata, all other dashboard fields, stored records and backups remain unchanged. Invalid modes fail with HTTP 400.
2. New API and client regression tests failed against the prior implementation, then passed with the change. Rich workflow, encrypted-file byte identity, full audit API, backup and restored audit comparisons pass. The client suite now has 29 scenarios, including safe campaign-ID query encoding.
3. Two independent local 1,000-profile runs compared 20 alternating-order pairs each. Responses fell from 4,678,040 to 3,179,879 bytes (32.03%). Every other field matched after normalizing only response-generation clocks. Local median/p95 observations and their limits are in `OPERATIONAL_VALIDATION.md`; no CPU, memory or browser-render speedup is claimed.
4. Browser network inspection confirmed the real compact request returned HTTP 200. Synthetic mentor creation and audit persistence after reload passed with no reported console warnings/errors. Screenshot capture remained blank, so visual acceptance is still open. The temporary browser tab and runtime were stopped.
5. Full pinned-runtime Windows release checks passed in `artifacts/release-check-compact-dashboard-2026-10-13.log`, including dependency audit, type checks, workflows, launcher/storage scenarios, installed upgrades and independent-key recovery. The rebuilt unsigned installer is identified in `PRODUCTION_READINESS.md`. No real messages, public tunnel, main merge or public release were performed.

## 2026-10-13 Launcher Fixture Port Reservation

1. Linux CI run `38370979987` failed in the last ngrok shutdown fixture with `EADDRINUSE` before discovery; its Windows release job passed. The route and localization tests had passed on Linux. The failed run remains recorded rather than treated as accepted.
2. Found an allocation race in the test setup: it released the planned MARO port before selecting the inspector port. Kept that reservation until the inspector is listening, added held-reservation/distinct-port assertions and included both ports in failure diagnostics. The original CI log does not identify the competing listener, so the exact collision owner is not asserted.
3. The new reservation invariant failed on the old ordering. With the corrected ordering, the focused persistent-cleanup-on-stop case passed. Inspector allocation is now inside the cleanup boundary. No production launcher code, timeout or failure assertion was relaxed, and no provider connection was opened.
4. All 29 local process scenarios passed in `artifacts/check-ngrok-port-reservation-2026-10-13.log`, including occupied-port rejection and shutdown cleanup. This test-only patch does not change the installed application payload or the local installer hash.

## 2026-10-13 Current MicroMentor Discovery Route

1. Read-only live navigation from the authenticated Home page through the visible Explore button confirmed `https://app.micromentor.org/explore` with mentor results. Home exposed no WebMCP tools. Flutter accessibility required Enter on its visible accessibility placeholder; no page script, provider API, inbox or messaging action was used.
2. Replaced the generated classic directory start link with the current Explore route. Existing stored classic profile URLs and recipient matching remain unchanged. Updated the generated rationale to describe only the observed browse-and-review workflow.
3. Added an exact API route assertion, reproduced its failure on the previous build, and passed it in the rebuilt API/release suites. Verified the generated native link in the Dutch local browser with no query appended, correct security attributes and a clean console.
4. Full Windows release checks passed in `artifacts/release-check-explore-route-2026-10-13.log`, including installed upgrades and recovery. The unsigned installer hash is in `PRODUCTION_READINESS.md`. This read-only live route check does not accept the entire platform or the installed extension; no main merge, signing purchase, real message or public tunnel was performed.

## 2026-10-13 Campaign And Source Controls

1. Added 106 paired messages for campaign metrics/settings/creation, project forms and source registration/discovery controls, bringing the catalog to 255. Added accessible field names, localized counts and explicit English boundaries for untranslated recommendations/readiness/runtime content. Stored status values and operator text are unchanged.
2. Replaced imperative source popups with native `_blank` links using `noopener noreferrer`, without appending the prepared query. The previous `window.open` return-value check could falsely report a blocked popup under `noopener`. The new structured notice reports only an opening request and remains translatable.
3. Added actual-component rendering and actual discovery-handler tests to the localization gate. They cover both languages, escaped values, field names, stable enum values, completion/empty/unchanged guards, source links and notice parameters.
4. Browser-tested a synthetic project/campaign/source through the real forms: retained unsaved input across locale changes, blocked premature completion, saved paused status, source count/note updates, translated existing add-source confirmation and persistence after reload. Console was clean. Captured screenshots remained blank; no visual/mobile acceptance or external provider navigation is claimed.
5. Full Windows release checks passed in `artifacts/release-check-campaign-localization-2026-10-13.log`, including installed upgrades and independent-key recovery. The rebuilt unsigned installer hash is recorded in `PRODUCTION_READINESS.md`. Owned browser/server test sessions were stopped; no real messages, public tunnel, main merge or release publication were performed.

## 2026-10-13 Mentor Intake And Installer Payload

1. Added 83 paired English/Dutch messages for mentor list controls, manual entry and CSV intake, bringing the catalog to 149. Stored phases, CSV headers, user data and approved messages remain unchanged. Added per-mentor accessible names and language markers for untranslated detail/diagnostic regions.
2. Added actual-tab React rendering and CSV file-handler checks to the existing localization gate. Verified synthetic browser entry, phase saving, CSV preview/import, disabled import without a name mapping, retained unsaved input, translated existing notices and persistence after reload. No provider actions or real messages were performed. Screenshots were blank; visual acceptance remains open.
3. Refreshed the dependency audit, which found two advisories absent from the September result. Updated only `proxy-addr` 2.0.7 to 2.0.8 and `source-map-js` 1.2.1 to 1.2.2; the fresh audit reports zero vulnerabilities. This is not a repository-wide security assessment.
4. Reproduced a Windows packaging defect: `Compress-Archive` silently omitted a hidden copied Node executable, so the installer lacked `runtime/node.exe`. The new regression failed on the original command. Replaced the archive command with .NET `ZipFile.CreateFromDirectory`, with terminating errors. The regression now preserves hidden files/directories, visible/empty files and exact bytes, and rejects an existing archive without altering it.
5. Moved TypeScript's incremental cache out of the dependency directory. Hidden flags on pre-existing local generated outputs also caused write failures; these were corrected on the affected outputs without changing access permissions. Failed release runs are retained in `artifacts` rather than reported as successes.
6. The full pinned-runtime release gate passed in `artifacts/release-check-mentor-payload-final-2026-10-13.log`, including the new payload regression, localization checks, 28 client scenarios, 29 source-ngrok scenarios, 32 packaged Windows checks and installed startup/upgrades/independent-key recovery. The rebuilt installer remains unsigned; its exact hash is in `PRODUCTION_READINESS.md`. No main merge or public release was performed.

## 2026-09-06 Locale Controls And Preference Safety

1. Connected the saved English/Dutch preference to a language menu and 66 paired interface messages. Translated header/navigation, pagination, setup/pause notices, backup/recovery controls and fallback pages; most detailed workflows remain English.
2. Kept language changes independent of dashboard reloads and merged only the acknowledged locale, preserving unsaved drafts and safety fields. Fixed review-reproduced stale settings reads across settings writes, restore and reset, including uncertain failures and overlapping requests.
3. Added real React rendering and actual Home-handler checks, API preference checks and six real-HTTP settings consistency regressions. Both default tests and the full release gate now include localization. Targeted review found no remaining actionable issue in this bounded change; it was not a broad security assessment.
4. Verified browser switching, retained campaign/backup input, reload persistence, direct Dutch 404, existing status translation and connection-failure feedback using local synthetic workspaces. Test servers were stopped. Unreliable screenshot framing and viewport overrides leave visual/mobile acceptance open.
5. The full pinned-runtime Windows release gate passed in `artifacts/release-check-localization-final-2026-09-06.log`, including 28 client, 29 source-ngrok and 32 packaged Windows scenarios, upgrades and independent-key recovery. Additional direct restore/reset handler assertions passed after that stage of the release run. The rebuilt unsigned installer hash is recorded in `PRODUCTION_READINESS.md`; this is not production publication.

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
