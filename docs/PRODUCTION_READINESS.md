# Production readiness - 1.2.3 candidate

Updated: 2026-10-13. Target: one operator on Windows 11, with manual MicroMentor
discovery and final sending. This candidate is not declared production-ready or
published as a signed release.

## Release decision and next steps

Passing automated tests is necessary but does not accept the real operator path.
Complete these gates before declaring the candidate production-ready:

1. **Complete the installed extension workflow.** The operator manually loads the
   trusted extension because browser-tool policy blocks the extensions-management
   page. Then verify approval, recipient checks, filling, expiry, editor changes
   and cancellation on the actual platform without sending a message.
2. **Accept Windows installation and recovery outside this account.** Test a clean
   Windows 11 machine and another user account, including normal-user installation,
   restart, in-use upgrade, portable backup restoration and data retention.
3. **Accept the whole installed ngrok lifecycle.** Verify credentials, dedicated
   endpoint ownership, reuse, credential rotation, outages, reconnection and forced
   launcher termination. Complete the remaining PowerShell stream-write/flush and
   physical-filesystem acceptance; source-injected errors and Windows file-lock
   coverage are recorded below. Local
   fixtures cannot prove a real provider's behavior.
4. **Complete the independent security and distribution gates.** Run the blocked
   repository assessment in a supported managed-permission environment; triage and
   verify findings. Arrange publisher signing and browser-store distribution with
   explicit approval for costs, account changes and publication.
5. **Run operator acceptance and a sustained pilot.** Complete the remaining Dutch
   translations and real-device accessibility acceptance. Verify the daily workflow, slow or lost
   write acknowledgements, recovery and larger/message-heavy workspaces. Record
   failures and response/resource measurements before setting support limits.

Do not merge or publish automatically when a test run becomes green. Accept a
specific source revision and installer hash, record residual risks and obtain the
operator's release decision. The table below separates proof already obtained from
work still awaiting acceptance.

## Verified on the current candidate

The full local `npm run check:release` passed on Windows 11 Pro x64 using
Node.js 22.23.2. The latest output is
`artifacts/release-check-responsive-final-2026-10-13.log`, including all 36 client
connection scenarios, 29 source-launcher/runtime ngrok scenarios, 32 packaged
Windows function/block checks and fresh/reused installed-runtime Host checks.
Installed startup, configuration restart, stopped/in-use upgrades and recovery
into a second installation with a fresh key also passed. A newly submitted
revision still requires its own CI run. The locale rendering/handler gate and
the hidden-file installer payload regression also pass within this release run.
Earlier attempts found newly reported dependency advisories, local hidden-output
write errors and the missing hidden runtime packaging bug. Those failed attempts
are not counted as successful release checks.

| Requirement | Evidence |
| --- | --- |
| Dependency audit | Zero reported vulnerabilities after patch updates |
| Client and server contracts | Both TypeScript checks passed |
| API workflow | Encrypted production API smoke passed, including approval, handoff, backup/restore and 43 workflow audit events |
| Extension regression gate | Actual popup handlers exercised with simulated browser APIs; route, expiry, wrong-recipient, target-page drift, editor activation, fallback and clear checks passed |
| Live MicroMentor compatibility scope | Read-only browser reconnaissance confirmed Home -> Explore -> results, profile -> Request Mentorship, a single visible unlabeled Flutter textarea, Inbox navigation, and Trainings opening the separate Academy host. Existing tests cover app profile/query matching and the sole-editor fallback, but the installed extension was unavailable for a live fill. Chats, invite decisions, courses, account settings and sending are outside MARO's assisted-only scope. This is not whole-platform or installed-extension acceptance; see [live evidence and boundaries](MICROMENTOR_LIVE_CHECK_2026-10-13.md). |
| Runtime pin | `.node-version` controls CI and installer packaging; wrong-version packaging was rejected before output mutation |
| Installer contents | Bundled Node executable and manifest identify 22.23.2 x64; required app/extension payload files found |
| Installed startup | Encrypted runtime started with development tools removed from PATH |
| Upgrade | Stopped and in-use upgrades preserved encrypted ledger and DPAPI key bytes |
| Portable recovery | Exported synthetic data restored into a second installation with its own freshly generated key; campaign/project relationship and persistence after restart verified |
| Larger workspace | 1,000 synthetic profiles imported through the API, exported, restored with exact profile-field comparison, and retained after forced process termination |
| Recovery boundaries | Restore preview leaves both encrypted files byte-identical; oversized requests rejected; corrupt primary recovers from rotating backup with integrity and audit checks |
| Injected storage failures | Ten backup/primary fault cases passed with intact acknowledged data, cache isolation, temporary-file cleanup, successful retry and restart integrity; these are simulated filesystem errors, not physical disk or power-loss tests |
| Post-commit cache failure | An injected metadata error after successful replacement preserves HTTP 200 and the saved project; the next read reloads storage and replaying the same idempotency key does not duplicate the record |
| Client connection resilience | 36 isolated real-HTTP scenarios pass: deadlines through body transfer, cancellation, request/timer cleanup, no automatic retry, uncertain write feedback, slow successful responses, fresh reads after successful/uncertain updates, restore/reset, compact dashboard query encoding and overlapping/coalesced writes. Actual Home-handler and controlled browser tests verify stale results cannot overwrite newer campaign/safety/edit state, including a post-save lost acknowledgement. This is single-client coordination, not cross-window or live-ngrok acceptance; see [consistency scope](OPERATIONAL_VALIDATION.md#dashboard-read-consistency). |
| Compact dashboard | The UI explicitly requests audit metadata without before/after snapshots. Full APIs, storage and backup/restore retain complete audit records. Two local 20-pair synthetic runs reduced response bytes by 32.03% with deep equality of all other fields. Browser network inspection confirmed HTTP 200 for the compact request; synthetic mentor creation and audit persistence passed. This is not rendering, CPU or memory acceptance; see [operational evidence](OPERATIONAL_VALIDATION.md#compact-dashboard-comparison). |
| Incremental Dutch interface | 442 paired messages cover initial controls, mentor list/manual entry/details, timeline categories, privacy buttons, CSV intake, campaign/project forms, source/discovery, review/response/billing, uncertainty/reconciliation and stale-refresh/navigation feedback. Actual-component and handler checks cover labels, unchanged values/callbacks, privacy, approval/copy guards and local amounts. Synthetic browser checks include preserved draft/reply/note input across language changes, local approval, saved response and cost/invoice persistence. Generated operational text and extension strings remain untranslated; full translation and assistive-technology acceptance remain open. See [localization evidence](LOCALIZATION_VALIDATION.md). |
| Responsive controls and zoom | Fixed overview/mentor overflow, narrow export/support controls and long review/uncertainty actions. All six tabs in both languages passed document/button bounds checks at verified CSS widths 320, 390, 768 and 1440; Dutch review screenshots at 320/1440 were inspected. Removed the viewport zoom cap and added component/template regressions. Emulated keyboard checks are not physical-device, touch, screen-reader or all-state acceptance; see [responsive scope](LOCALIZATION_VALIDATION.md#responsive-controls-and-zoom---2026-10-13). |
| Late action completion | Actual-handler tests and synthetic browser interception cover saves and automatic refreshes completing after tab/campaign changes, preserved input, visible unknown outcomes, view-scoped reports and ordinary current-view form reset. No write is cancelled or automatically retried. Same-view edits and cross-window synchronization remain separate; see [navigation evidence](OPERATIONAL_VALIDATION.md#navigation-after-slow-actions). |
| Truthful delivery history and reconciliation | The timeline distinguishes uncertain, confirmed and failed outcomes, keeps uncertainty context behind privacy controls and reflects explicit resolution. New handoffs are blocked across directly matching identities/URLs and campaigns while uncertain. Approval content is frozen; verified resolution is exposed in Review. API, component and synthetic browser checks pass; failed-resolution notes and clipboard fallbacks respect privacy controls. See [delivery evidence and limits](UNCERTAIN_DELIVERY_VALIDATION.md). |
| Hidden installer payload files | A regression reproduced the omission of a hidden runtime by the old archive command. The replacement includes hidden files/directories and preserves exact extracted bytes; existing-archive collisions fail without changing the archive. The rebuilt installer starts its bundled runtime and passes the installed upgrade/recovery checks. |
| Source ngrok lifecycle | 29 real-process/local-inspector cases cover own-child readiness, bounded startup/discovery, endpoint and policy checks, pre-verification Host rejection, process exits, cancellation and cleanup. Twelve configuration I/O cases exercise partial writes, exclusive-create collisions, replacement failure and deletion refusal, including during normal shutdown. Persistent cleanup refusal reports the owned file and returns failure; it is not claimed successfully removed. Partial-response/GC regressions are also included; no public tunnel was opened. |
| Packaged Windows ngrok functions and blocks | 32 local-fixture cases cover endpoint matching, deadlines, keyed configuration changes, process identity, parent-controlled cleanup and ten Windows configuration scenarios. Real locks exercise failed replacement, credentials-file deletion and process/host publication. Successful controls cover UTF-8, quoting, startup and registration-before-publication. This is not whole-launcher or live provider acceptance. |
| Installed Host authorization | Fresh startup rejects the configured unverified endpoint with HTTP 421. A reused server with a seeded stale host (first verified HTTP 200) keeps its PID but revokes both the old and new unverified domains. |
| Recommendation indexing | 180 indexed/direct equivalence cases pass; distinct-profile URL reads drop from 2,002,000 to 1,000 in the 1,000-profile regression fixture; full API and release gates pass |
| Mentor-list pagination | Page-boundary tests pass; live synthetic browser interactions verified 25 cards, page 40, search/source reset, empty results, retained notes/stage and heading focus. Desktop/mobile screenshot acceptance remains open. |
| Process cleanup | Test runtimes stopped and temporary installations cleaned up |

The initial recovery attempt correctly rejected the old migration test fixture:
that fixture had only a schema marker and no operator. The fixture now includes
the required operator before testing real campaign recovery. Restore validation
was not relaxed.

The installer accepts only the pinned x64 runtime. Its source archive was
downloaded from `nodejs.org` and checked against the vendor's SHA-256 list.
Node 22 remains within its maintenance support period according to the
[Node release schedule](https://github.com/nodejs/Release).

## Local artifact

- File: `artifacts/MARO-Windows11-Setup.exe`
- Candidate version: 1.2.3
- Size: 33,681,408 bytes
- SHA-256: `47C7F39898BE2853ACC6668B4009FB50C1F511A87C644730427543095208EF15`
- Signature: unsigned (`NotSigned` checked on this artifact). Publisher signing and clean-machine trust acceptance remain open.

This hash identifies the local binary, not a future CI rebuild. Installer builds
are not claimed byte-for-byte deterministic. Verify the hash of each distributed
artifact separately.

## Dependency remediation

The 2026-10-13 refresh found two newly reported advisories and updated the locked
dependencies to `proxy-addr` 2.0.8 and `source-map-js` 1.2.2. The subsequent audit
reports zero vulnerabilities. The former addresses spoofed IP trust under certain
IPv4-mapped IPv6 subnet configurations; the latter addresses excessive work from
untrusted indexed source-map offsets. These advisory descriptions do not establish
that either condition was exploitable through MARO. Sources:
[proxy-addr advisory](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) and
[source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

Browserslist was updated to 4.28.9, including its browser-data dependencies.
Express/body-parser currently constrain `qs` to the 6.15 release line, so
`package.json` overrides `qs` to 6.16.0. Remove the override when the upstream
dependency range admits a patched version and the release tests still pass.
The installed Express dependency was checked directly and rejected the
published bracket/comma array-limit regression case. See the
[Browserslist advisory](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) and
[qs advisory](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx).

These are dependency-audit and targeted regression results, not a new exhaustive
repository security assessment or proof that every advisory was reachable in MARO.

## Remaining acceptance work

| Workstream | Current status and evidence needed |
| --- | --- |
| Installed extension | Pending. The 2026-09-04 live test exercised the fill function directly, not the popup or `chrome.scripting`. Browser security policy now blocks agent access to `chrome://extensions`; the operator must load the trusted unpacked extension manually. A complete approval-to-fill test is still required. |
| Clean Windows 11 and another user account | Pending. Two isolated installations and fresh keys were tested under the same existing Windows account. The restricted PATH test is not a clean-OS test. Windows Sandbox was not available as a command on this host. |
| GitHub checks | Every accepted source revision needs its own successful Linux and Windows run. Inspect the [branch's CI runs](https://github.com/Robert-Velhorst/009-Micromentor-reachout/actions?query=branch%3Acodex%2Fgiant-goal-completion) and compare the run's commit with the revision being accepted; a predecessor's green result is not proof for a new patch. |
| Repository security assessment | A fresh repository-wide assessment remains open. On 2026-09-05, the Deep Scan plugin refused to start because it requires a managed filesystem permission profile; this session has unrestricted filesystem access. No scan findings or completion result were produced. Zero dependency advisories and passing adversarial API tests do not replace the broad assessment. |
| Signed distribution | Pending publisher signing setup and verification on a clean Windows device. No certificate was purchased and no store submission was made. |
| Extension distribution | Unpacked development installation is available. Ordinary user distribution still needs a supported browser-store release process. |
| Installed ngrok path | The PowerShell launcher is separate from `scripts/ngrok.mjs`. Packaged functions and selected startup/publication blocks have identity, file-lock and cleanup coverage; the installed local runtime also has Host-boundary checks. Complete live startup/reuse/credential rotation, authentication, outages, forced-parent termination, stream-write/flush fault injection and physical-disk behavior remain open. |
| Operational pilot | The bounded 1,000-profile API/recovery, injected storage-error cases and client connection tests pass; see [operational evidence](OPERATIONAL_VALIDATION.md). Compact response-size reduction, controlled browser post-save acknowledgement failures, same-client stale-response rejection and late mutation-callback navigation have separate evidence above. Responsive visual acceptance, complete browser interaction coverage, same-view concurrent input, sustained real usage, cross-window changes, installed-runtime outage recovery, hardware interruption, physically full volumes, live ngrok outages, and larger-than-tested datasets remain open. |
| Dutch interface | Language selection, initial controls, mentor list/manual entry/details, timeline categories, privacy buttons, CSV intake, campaign/project, source/discovery and review/response/billing controls are implemented and tested. Generated timeline/quality/measurement text, readiness/runtime/audit panels, recommendations, handoff notices, server messages and the extension still need translation. See [coverage and remaining acceptance](LOCALIZATION_VALIDATION.md); partial control coverage is not full Dutch-language acceptance. |
| Unresolved delivery workflow | Implemented and checked locally: workspace-wide record/resolve UI, server guard across direct identity/URL matches, frozen approval, restore preservation, explicit verification and replay protection. Both outcomes passed synthetic browser checks, including locale preservation and privacy repair. Controlled browser post-save acknowledgement failures retained notes, blocked retries and recovered saved results. Same-client stale responses no longer undo safety state, including after a lost acknowledgement. Already copied text/offline packages cannot be revoked. Cross-window changes, installed-runtime/live-ngrok outages, installed-extension use and live operator acceptance remain open; see [scope and evidence](UNCERTAIN_DELIVERY_VALIDATION.md). |

## Installed-extension acceptance procedure

1. In Chrome, load the repository's `browser-extension` folder as an unpacked
   extension. Confirm it reports version 1.2.3 and only active-tab, scripting and
   clipboard-write permissions.
2. Create a disposable draft in MARO for a selected mentor, review and approve
   it, then copy a fresh extension package. Keep the final Send action manual.
3. Open the matching MicroMentor profile, select Request Mentorship and focus
   Customize your message before opening the extension popup.
4. Paste the package and choose Fill approved draft. Compare the rendered text
   with the approved draft, then move focus away and verify it remains correct.
5. Restore the original provider draft, close the form and verify nothing was
   sent. Opening a different mentor must refuse direct filling. Expired packages
   must neither fill nor copy content as fallback.
6. Repeat the dormant-editor case and follow the activation guidance. The popup
   does not retain packages across closing; paste the package again after reopening.

The user already authorized the unsent live test. The remaining manual action
is required by a browser-tool policy limitation, not missing permission to test.

## Clean-machine acceptance procedure

Use a disposable Windows 11 x64 account or VM with no Node/npm installed. Verify
the installer hash, install as a normal user, launch through the Start menu, and
complete onboarding. Create synthetic records, export a portable backup, close
and restart the app, upgrade while it is open, and verify records remain.

In a second account or machine, install a fresh copy, preview and restore the
exported portable backup, then restart and compare records. Do not copy the old
DPAPI key as the transfer mechanism. Check uninstall/reinstall behavior and data
retention on disposable data. Record the OS build, app version, artifact hash,
observed failures and results before accepting the candidate.
