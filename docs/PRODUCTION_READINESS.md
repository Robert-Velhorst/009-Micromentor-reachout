# Production readiness - 1.2.3 candidate

Updated: 2026-09-05. Target: one operator on Windows 11, with manual MicroMentor
discovery and final sending. This candidate is not declared production-ready or
published as a signed release.

## Verified on the current candidate

The full `npm run check:release` passed locally on Windows 11 Pro x64, using
Node.js 22.23.2. The latest local output is
`artifacts/release-check-index-2026-09-05.log`.

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
| Recommendation indexing | 180 indexed/direct equivalence cases pass; distinct-profile URL reads drop from 2,002,000 to 1,000 in the 1,000-profile regression fixture; full API and release gates pass |
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
- Size: 33,661,952 bytes
- SHA-256: `0EF72326649B43017A07EFF48B6A08DA01767178DAF5834C87470B0945A74A2C`
- Signature: unsigned. No code-signing certificate was found in the current user's Windows certificate store.

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
| GitHub checks | Revision `f6ebd13` passed Linux and Windows, including the larger-workspace test, in [run 33931098877](https://github.com/Robert-Velhorst/009-Micromentor-reachout/actions/runs/33931098877). Subsequent recommendation-index changes require their own successful submitted-revision run. |
| Signed distribution | Pending publisher signing setup and verification on a clean Windows device. No certificate was purchased and no store submission was made. |
| Extension distribution | Unpacked development installation is available. Ordinary user distribution still needs a supported browser-store release process. |
| Operational pilot | The bounded 1,000-profile API/recovery exercise passes; see [operational evidence](OPERATIONAL_VALIDATION.md). Relationship indexing improves local dashboard timings, but browser rendering and response size remain open. Sustained real usage, failures during an unacknowledged write, disk-full conditions, ngrok outages, and larger-than-tested datasets remain open. |
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
