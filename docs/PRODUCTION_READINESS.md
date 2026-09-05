# Production readiness - 1.2.3 candidate

Updated: 2026-09-06. Target: one operator on Windows 11, with manual MicroMentor
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
   launcher termination. Close temporary-configuration I/O failure cases in both
   launchers. Local fixtures cannot prove a real provider's behavior.
4. **Complete the independent security and distribution gates.** Run the blocked
   repository assessment in a supported managed-permission environment; triage and
   verify findings. Arrange publisher signing and browser-store distribution with
   explicit approval for costs, account changes and publication.
5. **Run operator acceptance and a sustained pilot.** Complete Dutch labels and
   responsive visual/accessibility checks. Verify the daily workflow, slow or lost
   write acknowledgements, recovery and larger/message-heavy workspaces. Record
   failures and response/resource measurements before setting support limits.

Do not merge or publish automatically when a test run becomes green. Accept a
specific source revision and installer hash, record residual risks and obtain the
operator's release decision. The table below separates proof already obtained from
work still awaiting acceptance.

## Verified on the current candidate

The full `npm run check:release` passed locally on Windows 11 Pro x64, using
Node.js 22.23.2. The latest local output is
`artifacts/release-check-windows-ngrok-final-2026-09-06.log`, including all 22 client
connection scenarios, 17 source-launcher/runtime ngrok scenarios, 22 packaged
Windows checks and fresh/reused installed-runtime Host authorization checks.

| Requirement | Evidence |
| --- | --- |
| Dependency audit | Zero reported vulnerabilities after patch updates |
| Client and server contracts | Both TypeScript checks passed |
| API workflow | Encrypted production API smoke passed, including approval, handoff, backup/restore and 43 workflow audit events |
| Extension regression gate | Actual popup handlers exercised with simulated browser APIs; route, expiry, wrong-recipient, target-page drift, editor activation, fallback and clear checks passed |
| Runtime pin | `.node-version` controls CI and installer packaging; wrong-version packaging was rejected before output mutation |
| Installer contents | Bundled Node executable and manifest identify 22.23.2 x64; required app/extension payload files found |
| Installed startup | Encrypted runtime started with development tools removed from PATH |
| Upgrade | Stopped and in-use upgrades preserved encrypted ledger and DPAPI key bytes |
| Portable recovery | Exported synthetic data restored into a second installation with its own freshly generated key; campaign/project relationship and persistence after restart verified |
| Larger workspace | 1,000 synthetic profiles imported through the API, exported, restored with exact profile-field comparison, and retained after forced process termination |
| Recovery boundaries | Restore preview leaves both encrypted files byte-identical; oversized requests rejected; corrupt primary recovers from rotating backup with integrity and audit checks |
| Injected storage failures | Ten backup/primary fault cases passed with intact acknowledged data, cache isolation, temporary-file cleanup, successful retry and restart integrity; these are simulated filesystem errors, not physical disk or power-loss tests |
| Post-commit cache failure | An injected metadata error after successful replacement preserves HTTP 200 and the saved project; the next read reloads storage and replaying the same idempotency key does not duplicate the record |
| Client connection resilience | 22 isolated real-HTTP scenarios pass: deadlines through body transfer, cancellation, request/timer cleanup, no automatic retry, uncertain write feedback, and slow successful responses. This is not rendered-browser or live-ngrok acceptance. |
| Source ngrok lifecycle | 17 real-process/local-inspector cases pass: own-child readiness, bounded startup/discovery, endpoint and policy checks, pre-verification Host rejection, process-exit handling, cancellation and cleanup. Partial-response/GC regressions are included; no public tunnel was opened. |
| Packaged Windows ngrok functions | 22 local-fixture cases pass: exact endpoint matching, body deadlines, keyed configuration changes, cross-process fingerprint stability, altered process identities, stale/valid stop records, retained handles and parent-controlled test cleanup. This is not whole-launcher or live provider acceptance. |
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
- Size: 33,665,536 bytes
- SHA-256: `9548EDC5D93F3BE9A0165A1497E67E14D1A60283265819F4A7B2A5829FD1AE8B`
- Signature: unsigned (`NotSigned` checked on this artifact). Publisher signing and clean-machine trust acceptance remain open.

This hash identifies the local binary, not a future CI rebuild. Installer builds
are not claimed byte-for-byte deterministic. Verify the hash of each distributed
artifact separately.

## Dependency remediation

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
| GitHub checks | Revision `71b82da` passed Linux and Windows, including source ngrok lifecycle checks, in [run 33993749112](https://github.com/Robert-Velhorst/009-Micromentor-reachout/actions/runs/33993749112). Subsequent Windows-launcher changes require their own successful submitted-revision run. |
| Repository security assessment | A fresh repository-wide assessment remains open. On 2026-09-05, the Deep Scan plugin refused to start because it requires a managed filesystem permission profile; this session has unrestricted filesystem access. No scan findings or completion result were produced. Zero dependency advisories and passing adversarial API tests do not replace the broad assessment. |
| Signed distribution | Pending publisher signing setup and verification on a clean Windows device. No certificate was purchased and no store submission was made. |
| Extension distribution | Unpacked development installation is available. Ordinary user distribution still needs a supported browser-store release process. |
| Installed ngrok path | The PowerShell launcher is separate from `scripts/ngrok.mjs`. Packaged-function checks cover endpoint matching, keyed configuration fingerprints and retained process identity; the installed local runtime also has Host-boundary checks. The complete live startup/reuse/credential-rotation path, authentication, outages, forced-parent termination and temporary-configuration filesystem failures remain open. |
| Operational pilot | The bounded 1,000-profile API/recovery, injected storage-error cases and client connection tests pass; see [operational evidence](OPERATIONAL_VALIDATION.md). Responsive visual acceptance, complete browser interaction coverage, response-size reduction, sustained real usage, end-to-end reconciliation after a lost write acknowledgement, hardware interruption, physically full volumes, live ngrok outages, and larger-than-tested datasets remain open. |
| Dutch interface | Full translation remains open; storing a locale preference is not a complete Dutch UI. |

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
