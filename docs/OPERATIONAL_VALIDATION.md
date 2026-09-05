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
