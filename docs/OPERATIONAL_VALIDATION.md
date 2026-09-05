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

## Workload and assertions

- Import 1,000 distinct synthetic mentor profiles in ten batches through the
  normal CSV API, with profile content, identities, fit assessments and audit events.
- Reimport a batch and confirm no extra profiles are created.
- Read the complete dashboard 20 times and measure full HTTP response delivery.
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

## Still required

The dashboard response size and frontend rendering warrant further profiling
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
