# Operational validation - 1.2.3 candidate

## Scope

This is a bounded synthetic API and recovery test, not a completed real-user
pilot or proof of all MicroMentor functionality. It makes no provider requests
and sends no messages. No operator workspace is opened or modified.

Run `npm.cmd run check:operational` on Windows, or `npm run check:operational`
elsewhere. It builds the production bundle, starts it on a temporary loopback
port, and creates a uniquely named encrypted test workspace below `artifacts`.
Its own server is stopped and test workspace removed on completion or failure.
The machine-readable report is `artifacts/operational-check.json`; each run
replaces that report. It contains source revision, dirty-worktree indicator,
bundle SHA-256, runtime, operating system, measurements, and checks.

The check also runs within `check:release`, after the production API suite.
Linux CI runs it after `npm test`; Linux and Windows CI upload separate reports,
including a failure report when one is available.

## Client connection failures

`npm run check:client-requests` compiles the actual TypeScript API client and runs
it against isolated loopback HTTP servers. Twenty-two scenarios passed locally on
2026-09-05 with Node.js 22.23.2. The test also runs in `npm test` and the release
gate. Client timers are advanced deterministically; fetch and response streams
use real connections. No MicroMentor requests, operator records or public tunnels
are involved, and each owned test server is closed.

The original client reproduced an indefinitely pending read. Regression checks
now cover stalled headers and bodies, coalesced requests, fresh reads after a
timeout, connection loss for GET/POST/PATCH, cancellation and timer/listener
cleanup, preserved validation errors, uncertain mutation outcomes, and a slow
write that completes successfully within its longer deadline. The client does
not retry automatically. Read deadlines are 60 seconds; other requests have
120 seconds, including full response transfer.

This is client transport evidence, not rendered-browser acceptance, a live ngrok
outage test, or proof of exactly-once writes across connection loss. The client
cannot undo server work by aborting fetch. Operators must refresh and inspect
saved state before manually repeating an action with an unknown outcome. The
separate encrypted API/storage suites remain the evidence for persistence.

## Source ngrok launcher

`npm run check:ngrok` builds MARO and runs `scripts/check-ngrok-launcher.mjs`.
Normal tests and the release gate reuse their existing build. Twenty-nine process
scenarios exercise the actual source launcher and encrypted MARO server. Only
the external ngrok executable and inspector destinations are replaced by local
fixtures; no real ngrok agent, account, token or public endpoint is used. The
fixtures validate the actual CLI arguments and authentication-policy file before
returning endpoint metadata. All test workspaces, listeners, recorded child
processes and temporary configuration are checked or cleaned up. Persistent
deletion-refusal fixtures deliberately leave a file for the launcher to report;
the test runner removes only those owned fixture files after checking the result.

The old launcher reproduced an unsafe startup path: an unrelated service on the
requested port allowed the ngrok child to start, and the launcher could then exit
with status zero despite MARO failing. The launcher now requires an IPC listening
confirmation from its own child. It stops owned children on errors, exits and
interruption, and waits for their closure before returning.

On 2026-10-13, Linux CI for the Explore route change failed in the final shutdown
fixture with `EADDRINUSE` before discovery. Windows and the earlier local release
passed. Inspection found that the test released its MARO port reservation before
allocating the inspector port, allowing the inspector to reclaim it. The original
failure did not log the inspector port, so the identity of that run's competing
listener cannot be proved from its log. The fixture now retains the reservation
until the inspector is listening, asserts the ports differ, and reports both ports
on failure. The reservation invariant failed against the old ordering; the focused
shutdown case passes with the corrected ordering. Inspector startup is also inside
the fixture's cleanup boundary. Production launcher code, deadlines and the
occupied-port rejection test are unchanged; an unrelated external process can
still race after the final reservation release and must cause a failure.

Tests cover occupied ports, successful and dedicated-endpoint startup, version
probe timeout/cancellation, ngrok and MARO exits, stalled inspector headers and
bodies, fallback after a stalled or HTTP-error inspector, wrong endpoint name,
upstream, scheme/path or configured origin, invalid JSON, and cleanup. Before
verification, an automatically configured endpoint is absent from the generated
allowlist and the real MARO runtime rejects its Host with HTTP 421. Explicit
operator `MARO_ALLOWED_HOSTS` entries remain separately trusted.

A forced-GC case reproduced a stuck partial inspector response on the pinned
Node runtime despite fetch cancellation. The launcher now uses Node's native
HTTP request lifecycle and explicitly destroys its request/response on timeout.
The same GC test covers the app's existing runtime-status path, which passed
without changes. This records the observed regression, not a universal claim
about all Node fetch implementations.

Deadlines are five seconds for the version probe, fifteen seconds for owned
server readiness, and fifteen seconds for endpoint discovery (including at most
300 ms per inspector request). Tests anchor the discovery wait after actual
agent startup, separate from local-server startup. The stop-signal test emits the
launcher's SIGTERM event through a test-only IPC boundary for Windows portability;
it is not proof of every native console or OS shutdown mechanism.

Twelve configuration I/O cases cover partial policy/initial-host/published-host
writes, policy open/close failures, failed Host replacement, real exclusive-open
collisions for policy and both host-write phases, transient/persistent policy
deletion refusal, and a persistent refusal first encountered during normal
shutdown. The pre-fix code left a partial credentials file behind and removed the
previous hosts file before a replacement rename failed; both failures were
reproduced. Files are now registered only after exclusive creation succeeds and
before writing. A failed replacement leaves the old file intact until shutdown.

Faults before initial configuration cannot start MARO; failed policy creation
cannot start the agent. All I/O cases require exit status 1 with no termination
signal, no tunnel-ready announcement, and closure of the owned children. No
credentials are printed. A persistent removal refusal cannot be repaired by the
launcher: it reports the exact owned file path and keeps a failing exit status,
including when the operator otherwise stops normally. Resolve the filesystem
problem and remove that sensitive temporary file before sharing the machine.

These are injected errors at actual Node filesystem boundaries, not a physically
full disk or every filesystem's crash-consistency guarantee. The installed
PowerShell launcher is separate and is not accepted by the source-launcher suite.
Its focused checks are described below. Live ngrok authentication, outages,
complete installed reuse/credential-rotation workflows, forced parent termination
and remaining PowerShell write/flush-fault and physical-filesystem behavior remain
acceptance work. Windows file-lock coverage is described below.

## Packaged Windows ngrok functions

`npm run check:windows-ngrok` builds the Windows installer and runs thirty-two isolated
scenarios against function definitions parsed from the generated `MARO.ps1` and
`Stop-MARO.ps1`, plus its actual new-agent startup and endpoint-publication blocks.
Definitions and selected blocks run unchanged. Startup-block tests replace the
external process-start and inspector-lookup boundaries with an owned Node process
and fixture endpoint; they validate the actual generated Basic Auth file and quoted
policy argument, including a path containing spaces. Other cases exercise the actual
inspector lookup separately. This does not execute the complete installed launcher
with a real ngrok agent and never opens a public tunnel.

The old lookup accepted a correctly targeted but unrelated endpoint; a red test
reproduced this. Lookup now requires an exact endpoint name, loopback HTTP target
and valid HTTPS origin, including a match with any configured domain. Header/body
stalls and fallback are tested with a bounded wait. Inspector traffic-policy data
is not returned by the lookup.

The old stop helper also reproduced termination despite a stale creation-time
record. Ownership now includes the executable, installation directory, creation
time and exact quoted target/name. Tests recognize a real owned fixture process,
reject altered identity fields, refuse a stale stop record and stop a verified
process. Verified handles remain open through discovery and stopping, so a later
PID lookup is not used to select a stop target. An exited-process case checks
retained identity; an interrupted-PowerShell case verifies that the parent test
runner closes its own fixture process without relying on PowerShell cleanup.
Windows handles remain valid until closed, even after process exit, as documented
by [Microsoft](https://learn.microsoft.com/en-us/windows/win32/procthread/process-handles-and-identifiers).
Older records lacking the new identity are not trusted for reuse or
termination; operators may need to inspect an older agent manually after upgrade.

Reuse configuration is compared through a SHA-256 HMAC keyed by the protected
workspace key, not by storing Basic Auth credentials in process metadata. Tests
check stable fingerprints across fresh PowerShell processes and changes to the
target, domain, credentials, public opt-in or workspace key. They do not establish
real provider policy updates or successful reuse through the entire launcher.

The Windows release gate additionally sends a real HTTP request with a configured
but unverified Host to the isolated installed runtime and requires HTTP 421. It
then seeds a stale generated host, verifies HTTP 200, reruns the launcher with a
changed endpoint and skipped tunnel discovery, confirms the same server PID is
reused, and requires HTTP 421 for both unverified domains. An explicit operator
`MARO_ALLOWED_HOSTS` entry remains a separate trust decision.

Ten configuration scenarios add real Windows file-sharing locks and filesystem
operations. Coverage includes successful UTF-8 creation/replacement and host
normalization, actual exclusive-create refusal preserving a sentinel file, locked
host replacement, locked credentials-file deletion and successful cleanup after
unlocking, invalid policy parent directories, blocked process-state or host
publication, and successful startup/publication controls. Failed policy creation
cannot reach the process-start boundary. Failed cleanup or publication stops the
new owned process, while failed state publication leaves the previous record
unchanged. A publication observer verifies persisted process identity and the
configuration fingerprint before forwarding the real host writer, so rollback
cannot hide premature authorization.

The pre-fix packaged code left a temporary host file behind on replacement failure
and left the newly started agent alive when state persistence failed. Both were
reproduced with actual locks. Existing files are now replaced without an explicit
pre-delete; new files use exclusive creation. PowerShell needs a typed null backup
name for [.NET File.Replace](https://learn.microsoft.com/en-us/dotnet/api/system.io.file.replace?view=netframework-4.8.1),
which the successful-replacement control verifies. Cleanup retries three times,
then fails with the retained path rather than silently continuing. No ACLs or
operator data are changed by these tests.

These tests do not inject partial-write/flush failures into the Windows stream,
simulate a physically full drive, verify abrupt host termination, or establish
complete installed startup/reuse and live provider behavior. Those acceptance
items remain open; local lock tests must not be presented as covering them.

## Workload and assertions

- Import 1,000 distinct synthetic mentor profiles in ten batches through the
  normal CSV API, with profile content, identities, fit assessments and audit events.
- Reimport a batch and confirm no extra profiles are created.
- After one warmup per mode, read 20 alternating-order pairs of full and compact
  dashboards and measure complete HTTP body delivery. Compare every response
  field except the two omitted audit snapshots and three response-generation
  timestamps. Verify full audit history and encrypted storage are unchanged.
- Export an approximately 3.8 MB portable backup and preview its restoration.
- Verify that preview changes neither the primary encrypted file nor its rotating backup.
- Reject bodies above 16 MiB on both restore routes and above 1 MiB on the
  ordinary project route; verify that rejected requests do not change the ledger.
- Reset the disposable workspace and restore the export. Compare the SHA-256
  of every profile's complete serialized data, not only the count.
- Kill the owned process, observe the connection failure, restart, and compare
  all acknowledged profile data again.
- With the server stopped, corrupt the synthetic primary file. Restart and
  verify recovery from the valid rotating backup, all profile data, referential
  integrity, and the recovery audit event.

## Bugs reproduced and fixed

1. Exported larger workspaces could not be restored: the restore request was
   rejected with HTTP 413 by the ordinary 1 MiB parser. Only the two POST restore
   routes now accept up to 16 MiB. This limit includes JSON escaping and wrapper
   overhead, not just the downloaded file size. Ordinary routes remain at 1 MiB.
2. Restore preview rewrote the encrypted primary and rotating backup, despite
   making no logical changes. The regression test observed different encrypted
   file hashes. Preview now uses the existing non-persisting route option,
   avoiding both writes and preserving the recovery copy.

The initial test also contained an incorrect backup filename. That fixture error
was corrected to the application's `.json.backup` path; it was not an app defect.

## Recorded local measurement

The full release-gate run on 2026-09-05 at 01:33 Amsterdam time passed on
Windows 11 x64 (10.0.26200), Node.js 22.23.2. Production bundle SHA-256:
`bd1737526d3eca4420c758aeaa2a9debe0d498cca6f5a75e94c49c357d51fe2e`.

| Observation | Result |
| --- | --- |
| Complete operational check | 13 assertions passed; owned runtime and temporary data cleaned up |
| Portable backup | 3,786,821 bytes |
| Dashboard response | Approximately 4.68 MB per read |
| Dashboard median / nearest-rank p95 / maximum | 1,291 / 1,735 / 1,801 ms, from 20 sequential samples |
| Restore preview / restore | 123 / 411 ms, one sample each |
| Server RSS at workload start / end | 48.5 / 111.7 MiB |
| Server CPU time during measured workload | 29.422 CPU seconds over 34.957 elapsed seconds |

CPU and memory use the application's existing process snapshots. They exclude
the browser, installer, ngrok and the test runner. These are workload-boundary
samples, not peak memory or an idle-memory/leak test. HTTP timings include body
transfer but exclude JSON parsing in the caller and frontend rendering. Other
work was running on this host; do not infer a hardware-independent latency
guarantee or a before/after speedup from these numbers.

## Compact dashboard comparison

The interface now requests `auditDetail=summary`. This omits only `beforeState`
and `afterState` from dashboard audit entries. The default API response remains
full; `/api/audit`, campaign details, encrypted storage and portable backup/restore
retain the complete records. No polling, retry, extra request or dependency was
added. Unknown, empty, repeated and object-valued modes are rejected.

On 2026-10-13, a paired synthetic run on Windows x64 with Node 22.23.2 measured:

| Measurement | Full | Compact |
| --- | --- | --- |
| Response bytes | 4,678,040 | 3,179,879 |
| Samples | 20 | 20 |
| Median HTTP body completion | 106.25 ms | 92.26 ms |
| Nearest-rank p95 | 145.25 ms | 117.52 ms |

The response is 32.03% smaller in this fixture. Evidence:
`artifacts/operational-compact-first-2026-10-13.json` and
`artifacts/check-compact-operational-first-2026-10-13.log`.
Both variants ran against the same unchanged ledger with alternating order.
A repeat within the full release gate measured the same byte counts and 32.03%
reduction: full median/p95 133.34/186.27 ms, compact 117.14/164.59 ms. Evidence:
`artifacts/operational-check.json` and
`artifacts/release-check-compact-dashboard-2026-10-13.log`.
API workflow tests also compare richer approval/message/billing data and verify
that full audit payloads survive backup and restore. Client real-HTTP tests verify
the explicit mode and correct campaign-ID encoding. New regression tests failed
against the prior implementation before passing with the change.

The fixed synthetic fixture requires at least 20% fewer response bytes; timing is
observational, not a CI gate. These results exclude JSON parsing and browser
rendering and do not establish a CPU or memory reduction. The process snapshots
cover the combined workload, not separate mode peaks. Do not compare these
latencies directly with the older host measurements above.

An isolated local browser check confirmed an actual dashboard request with
`auditDetail=summary` and HTTP 200. A newly created synthetic mentor appeared in
the audit tab and persisted after reload; approval-required, privacy and manual
sending indicators remained active. No warning/error console entries were
reported. One immediate post-reload locator attempt timed out; the fresh page
state was loaded and the subsequent audit interaction passed. Screenshot capture
again returned blank pixels despite populated DOM/accessibility state, so visual
acceptance is not claimed. The owned browser tab and runtime were stopped.

## Still required

The remaining dashboard payload and frontend rendering warrant further profiling
and targeted optimization with unchanged duplicate/contact safeguards.
No arbitrary latency threshold has been added to make CI look like a product
acceptance test. The measurements establish a baseline, not acceptable UX.

Further gates include browser/rendering tests with larger datasets, sustained
usage and idle measurements, simultaneous requests, uncertain in-flight writes,
full-disk/permission failures, ngrok disconnection, and recovery in a different
Windows account. The forced kill here occurs after acknowledged writes; it does
not establish durability during every possible filesystem interruption.

Backups whose wrapped requests exceed 16 MiB still need a separately designed
and tested recovery path. This change does not imply unlimited workspace size.

## Relationship-index follow-up

The recommendation calculation repeatedly scanned every profile to find direct
identity/URL matches for each mentor. A deterministic test reproduced 2,002,000
profile-URL reads for 1,000 distinct profiles. A snapshot-local index now reduces
that to 1,000 reads in the same test. It is rebuilt for each calculation, not
cached globally. It matches identity OR normalized nonempty URL within the same
campaign and deliberately does not merge transitive chains.

`npm run check:recommendations` tests the actual TypeScript source through
esbuild in a Node VM, without starting a server or touching operator data.
The existing direct lookup is retained for write/contact guards and provides
the comparison oracle for 180 cases covering campaign isolation, empty and
normalized URLs, overlapping groups, canonical order, invalid/tied timestamps,
and rejected/draft/approved/sent message states. The test also checks concrete
recommendations and the deterministic profile-read budget. It is included in
both `npm test` and `check:release`.

The full local release gate passed again. The 2026-09-05 02:08 Amsterdam workload
used bundle SHA-256
`830a4511bbba0eb498578150cb02b8eed22b91f2e89b342a540f882f03a8b00d`.
The earlier raw report was retained locally as
`artifacts/operational-before-relationship-index.json` before the new run.

| Local measurement | Before | After |
| --- | --- | --- |
| Dashboard median, 20 reads | 1,291 ms | 226 ms |
| Dashboard nearest-rank p95 | 1,735 ms | 273 ms |
| Server CPU time over the workload | 29.422 s | 8.656 s |
| Server RSS at workload end | 111.7 MiB | 121.2 MiB |

These are sequential observations on a shared host, not a controlled hardware
benchmark. The deterministic test establishes reduced search work; the timing
samples support a local latency improvement. They do not prove reduced memory
use, a memory-leak fix, or a faster rendered browser experience. The response
still contains the complete campaign data; no features or historical records
were removed to obtain the improvement.

## Mentor-list pagination follow-up

The previous frontend mounted every filtered mentor card. During a synthetic
1,000-profile browser exercise, the tab became unresponsive and screenshot
capture returned a blank image. This observation does not establish a browser
crash or an out-of-memory cause. The list now mounts at most 25 cards, with
previous/next controls and direct page selection above and below the list.
Filtering still searches the complete campaign before slicing the current page.

On 2026-09-05, the in-app browser's DOM and interaction checks verified 25
cards, navigation to page 40, finding a profile outside that page, first-page
reset for a 111-result search and a source filter, and the empty-results
message. A typed note survived next/previous navigation, Save, and Refresh.
An unsaved stage change survived next/previous navigation. Using the bottom
pager moved focus to the native list heading, with 25 cards still mounted and
no warning/error console entries in the final check.
The test used only disposable synthetic data and did not contact MicroMentor.

`npm run check:mentor-pagination` checks the actual TypeScript page calculation:
empty lists, partial last pages, invalid/out-of-range requests, shrinking
results, and reaching all 1,000 distinct records exactly once across 40 pages.
It runs in normal tests and the release gate. These are calculation tests, not
automated React interaction coverage. Campaign switching, stage edits, filter
changes and focus behavior still need repeatable browser regression coverage.

Screenshot capture and requested viewport sizes were unreliable in this browser
session. No desktop/mobile visual acceptance or measured render-latency claim
is made. The temporary test server also reached its automatic cleanup timeout;
the later connection refusal was a stopped fixture, not an app crash.

The browser still receives and holds the entire campaign payload. Pagination
reduces mounted card/control count, not API response bytes or total workspace
memory. Message-heavy and duplicate-heavy workspaces, sustained use and browser
memory/latency measurements remain separate acceptance work.

The final local `check:release` passed with the focus correction included;
the log is `artifacts/release-check-pagination-2026-09-05.log`. Both disposable
browser workspaces and their owned servers were cleaned up, and the temporary
browser viewport override was reset.

## Storage-failure follow-up

`npm run check:storage` builds and starts the real production bundle with a
disposable encrypted workspace. A test-only Node preload injects one failure
at a time at the filesystem boundary; no fault-injection setting or endpoint
is added to the application. The test uses loopback HTTP, not provider traffic.
Normal tests and the release gate reuse their freshly built bundle for this
check, avoiding another build.

The child requests an ephemeral port and reports its listening address over
its inherited IPC channel before the runner sends HTTP requests. Fault
notifications are deliberately delayed and awaited by ID, with bounded waits
and child-exit rejection; HTTP and IPC delivery order is not assumed.

Five failures are exercised separately for the rotating backup and primary:

| Operation | Injected condition |
| --- | --- |
| Write | Write half the data to the real temporary file, then throw `ENOSPC` |
| Synchronize | Throw `EIO` before flushing the real handle |
| Close | Close the real handle, then report `EIO` |
| Replace | Throw `EACCES` before renaming the temporary file |
| Open | Throw `EACCES` before creating a temporary file |

The first test reproduced a partial temporary backup file left behind after
`ENOSPC`. Cleanup previously covered only rename failure. It now also covers
failures while writing, synchronizing and closing an owned temporary file.
If deletion itself fails, the original storage error is preserved; the app
cannot guarantee removal when the filesystem refuses cleanup.

For all ten cases, assertions require HTTP 500, unchanged primary bytes, a
complete recovery copy, no rejected mutation in subsequent API reads, no
temporary files when cleanup is available, and exactly one record after a
healthy retry. The primary-failure cases allow the backup to have advanced to
the complete pre-mutation primary. Finally, all acknowledged records must
survive process restart with valid referential integrity.

This is deterministic filesystem-error injection, not a physically full
volume, permission-policy change, hardware power-loss experiment, or a test of
all post-rename failures. The close case does not simulate an unclosed handle.
Errors during cleanup, interrupted processes leaving temporary files, actual
full-disk behavior and device-level durability remain separate acceptance work.

On 2026-09-05 all ten cases and restart integrity passed locally with Node.js
22.23.2 on Windows 11. The complete release gate also passed. After review,
the test runner's ownership and IPC coordination were tightened; that final
harness passed separately against the same production bundle. Evidence:
`artifacts/release-check-storage-2026-09-05.log` and
`artifacts/storage-failures-final-2026-09-05.log`.

## Post-commit cache failure

The next regression test injects `EIO` from the metadata read only after the
real primary-file replacement succeeds. Before remediation, the test confirmed
that the project was already present in a subsequent API read but the original
request returned HTTP 500 with a retryable error. Cache refresh had incorrectly
been treated as part of the required storage operation.

After successful replacement, the old cache is now invalidated. If metadata
reading or cache construction fails, a generic server warning is emitted and
the saved operation still returns success. The next request reloads storage.
The new test verifies one saved project, HTTP 200, replay of the same idempotency
key without duplication, and persistence after restart. The ten pre-commit
error cases must still reject their mutations and preserve previous data.

This covers a post-commit metadata exception, not every possible cache error
or HTTP delivery failure. It does not promise exactly-once execution across
connection loss, process termination or expiration of the in-memory idempotency
cache. Those remain separate operational acceptance cases.

The complete local release gate passed on 2026-09-05, recorded in
`artifacts/release-check-cache-commit-2026-09-05.log`. The final test with its
additional replay assertion passed separately in
`artifacts/storage-cache-final-2026-09-05.log`. Both test processes and their
disposable data were cleaned up.

## Dashboard read consistency

On 2026-10-13, two regressions reproduced stale dashboard state after a write:
`artifacts/check-dashboard-refresh-before-2026-10-13.log` shows an older response
replacing the current campaign, clearing a newly typed draft and overwriting the
delivery block. `artifacts/check-read-epoch-before-2026-10-13.log` shows a fresh
post-write dashboard read joining an older in-flight request instead of reading
the saved state.

The request layer now increments a read revision at the start and settlement of
each distinct write, including failure or an uncertain acknowledgement. GET/HEAD
coalescing is scoped to that revision. Identical pending writes still share one
request and one pending-write count. The dashboard captures the revision and
pending-write count, accepts only its latest load request, and rejects results
that overlap a write. Older successes/errors cannot replace newer state or finish
its loading indicator. A rejected latest result asks for explicit refresh; it
does not clear draft edits or safety guards. Ordinary loads leave runtime metadata
unchanged unless runtime refresh was explicitly requested. Unmount invalidates
outstanding dashboard loads.

`scripts/check-dashboard-refresh.mjs` executes the actual Home loading handler
with controlled completion order. It covers older success/error after a newer
result, older completion while a newer read is pending, current failure, writes
starting/finishing during reads, already-pending writes, retained edits/guards,
subsequent explicit reconciliation and runtime-state preservation. It is included
in the localization gate, `npm test` and the full release gate.

Seven additional real-HTTP scenarios in `scripts/check-client-requests.mjs` cover
dashboard, timeline and settings reads after both successful and unacknowledged
delivery writes, plus overlapping/coalesced write accounting. All 36 scenarios
pass with timers and connections cleaned up. The six original settings/restore/
reset freshness regressions still pass. Evidence:
`artifacts/check-read-epoch-after-2026-10-13.log`.

The coordination state is two numeric counters plus one React request ref, with
no new dependency, background poller, persistence format or provider traffic.
There is no automatic retry and no promise of atomic server snapshots across
separate endpoints. Scope is one mounted app/client module: writes from another
browser window or an external client are not broadcast to it. User changes to
forms during an otherwise valid explicit refresh retain the existing refresh
semantics; this patch protects stale results, not every unsaved-form workflow.
New refreshes intentionally issued by an older mutation callback are covered in
the next section. Cross-window coordination remains a separate acceptance case.

Built production assets were also checked in a fresh synthetic encrypted
workspace at `http://127.0.0.1:54101/` on 2026-10-13. Response-stage browser
interception was limited to local API Fetch requests:

- Held an HTTP 200 dashboard response from before recording uncertainty. Recorded
  uncertainty and delivered its newer dashboard response first, then released
  the old response. The uncertainty section and copy block remained.
- Repeated in reverse: held an unresolved snapshot, resolved as verified not sent,
  delivered the current snapshot, then typed an unsaved subject. Releasing the old
  response neither restored uncertainty nor erased the subject; Save edit stayed
  enabled. No subject change was submitted to the server.
- Held campaign A's response while creating synthetic campaign B and delivering
  its response. The selected campaign and displayed title remained B after A's
  late response arrived.
- Held a dashboard response, recorded a new uncertainty, then failed that write's
  HTTP 200 response with `ConnectionClosed`. Releasing the old dashboard showed
  the changed-workspace warning, retained the safety block and kept retry disabled.
  Explicit refresh recovered exactly one uncertain attempt and cleared the stale
  read warning without submitting another write.
- The language menu was disabled during a pending load; the attempted language
  overlap was not forced and is not claimed as a browser-tested scenario.
- Interception was cleared, no warning/error console entries were reported, and
  the temporary tab and owned server were stopped. These are DOM/interaction
  checks, not screenshots, installed ngrok, physical outages or provider writes.

The full pinned-runtime Windows release gate passed in
`artifacts/release-check-dashboard-races-2026-10-13.log`, including the 36 client
scenarios, actual handler tests, installer upgrades and independent-key recovery.
Client JavaScript is 369.69 kB / 102.99 kB gzip, 0.23 kB compressed above the
preceding build. This is bundle measurement, not sustained CPU/RAM or latency
acceptance. The current unsigned installer hash is in `PRODUCTION_READINESS.md`.

## Navigation after slow actions

On 2026-10-13, `scripts/check-navigation-completion.mjs` reproduced an older
mutation callback starting a fresh read of its captured campaign after the user
had changed views. The prior request-order guard could not reject this newer read.
Pre-fix evidence: `artifacts/check-navigation-before-2026-10-13.log`.

Home now captures a view revision for action completion. Explicit tab/campaign
navigation, recommended-action navigation and creating a campaign advance that
revision. An obsolete completion does not refresh its captured campaign or reset
the guarded form/report state. A status notice reports successful completion or
an unconfirmed result; the domain write is not cancelled or retried. An automatic
refresh already in flight also checks the view before applying either data or
errors. Delivery-control failures still reject their promise so the existing
uncertain-outcome protection remains effective. Successful campaign hydration
clears a different campaign's usage report.

The actual-handler tests cover old/current-view mutations, mentor entry, project
and campaign creation, invoice generation, usage reads, stale failures, delivery
failure propagation, late recommended-action navigation, view changes during an
automatic refresh, and campaign creation superseding an older save. The loading
handler suite also covers stale automatic-refresh success and failure. Both run
through the existing localization, test and release gates.

Browser checks used built assets with a fresh encrypted synthetic workspace on
`http://127.0.0.1:59193/`. Response-stage interception affected only local API
Fetch requests:

- Held a successful project-save acknowledgement, switched to Billing and typed
  an unsaved campaign title. Releasing the response retained the tab and input,
  displayed the completion notice, and retained the project-entry form on return.
- Failed another HTTP 200 acknowledgement with `ConnectionClosed` after switching
  tabs. The unknown-result notice appeared without navigation or input loss.
  Explicit refresh exposed both saved project names, each once, without retry.
- Held the automatic dashboard response after saving in campaign A, selected B
  and released B's response first. After typing an unsaved B title, releasing A's
  response preserved B and its edit and displayed a completion notice.
- On the final rebuilt assets, normal project creation cleared the submitted form
  and selected its saved project. The delayed-save/tab-switch/input-preservation
  case also passed with the Dutch interface and Dutch completion notice.
- Interception was cleared, the temporary tab closed and the owned server stopped.
  No warning/error console entries were returned at the final check.

This is single-client DOM/interaction and handler evidence, not screenshot,
installed-extension, real-ngrok, physical-outage or cross-window acceptance.
Same-view concurrent edits and file/clipboard callbacks are not comprehensively
protected by this revision guard. An explicit refresh retains its normal form
reset semantics. A campaign read overlapping a pending write can still request
explicit reconciliation rather than applying a potentially inconsistent snapshot.
There is no additional dependency, poller or persisted state; the client bundle
is 371.05 kB / 103.54 kB gzip, 0.55 kB compressed above the prior build. This is not
a sustained CPU, memory or latency measurement.

The full pinned-runtime Windows release gate passed in
`artifacts/release-check-navigation-2026-10-13.log`, including zero reported
dependency vulnerabilities, both TypeScript checks, the existing encrypted API,
36 client HTTP scenarios, storage/recovery tests, 29 source-launcher cases,
32 packaged Windows checks, installed upgrades and fresh-key recovery. The current
unsigned installer hash is recorded in `PRODUCTION_READINESS.md`.
