# Changelog

## 1.2.3 - Unreleased

- Clean up temporary ledger files after failed writes, flushes or closes as well as failed replacements; retain the original error if cleanup itself fails.
- Add isolated storage-fault tests for the encrypted primary and backup, rejected-mutation cache isolation, successful retries and restart integrity.
- Limit the mentor list to 25 profiles per page while keeping full-campaign search, source filters and unsaved edits during page navigation. Reset pages on filter/campaign changes and move keyboard focus to the list heading after paging.
- Add deterministic pagination boundary checks to normal tests and the release gate; document the separate live-browser acceptance scope.
- Index mentor relationships within each recommendation calculation, avoiding repeated full-profile scans while retaining direct identity/URL matching and unchanged write guards.
- Add recommendation behavior, indexed/direct lookup equivalence, and deterministic 1,000-profile complexity checks to normal tests and the release gate.
- Allow portable restore requests up to 16 MiB without raising the ordinary 1 MiB API limit.
- Keep restore preview read-only, preserving the encrypted ledger and its rotating backup.
- Add isolated 1,000-profile import, recovery, crash-restart, and resource measurements to Linux CI and the Windows release gate.
- Match current MicroMentor profile and request routes while rejecting unsupported destinations.
- Guide operators to activate the Flutter message editor and retain manual-copy fallback.
- Recheck handoff expiry on click, after tab lookup, and inside the target page; stop on destination changes before touching a field.
- Add popup lifecycle, expiry, recipient, and editor regression coverage to the release gate.
- Run installed Windows acceptance in CI, including upgrades and portable recovery under a fresh encryption key.
- Pin the Windows build runtime to Node.js 22.23.2 x64 and test installed launch without development tools on PATH.
- Update Browserslist and its data dependencies; override qs to patched 6.16.0 pending an Express dependency update.

## 1.2.2 - 2026-08-14

- Made Windows upgrades wait for the owned MARO processes to fully exit before application files are replaced.
- Added bounded retries for transient Windows application-directory locks while preserving atomic rollback and durable workspace data.
- Extended the release gate to prove the installed server process is gone before upgrade preservation is tested.
- Made normal in-use upgrades stop the ownership-verified runtime and restart stale server configuration when HAI, tunnel, Host, pause, or version settings change.
- Replaced broad ngrok-suffix Host trust with an exact launcher-managed endpoint allowlist for both dedicated and dynamically assigned URLs.

## 1.2.1 - 2026-08-09

- Moved Windows workspace data outside the replaceable application directory and added conflict-preserving legacy migration.
- Added automatic AES-256-GCM ledger encryption backed by a per-user Windows DPAPI-protected key.
- Made Windows upgrades atomic, preserved workspace data on uninstall, and added ownership-checked process lifecycle helpers.
- Replaced deprecated ngrok Basic Auth flags with Traffic Policy and isolated MARO tunnel discovery across Agent API ports.
- Required encrypted persistence for the default Docker Compose production path.

## 1.2.0 - 2026-08-08

- Added durable do-not-contact controls, cooldown enforcement, and an operator-controlled outbound safety stop.
- Added uncertain-send recording and explicit resolution without silently marking outreach as delivered.
- Added readiness, diagnostics, integrity, retention, workspace settings, and sanitized support-bundle APIs.
- Added request IDs, local API rate limiting, mutation idempotency, CI, and a `doctor` command.
- Replaced the static-only Docker image with a non-root Express runtime and persistent local data volume.
- Added the Giant Goal audit, acceptance, runbook, security, UI/API action, and final verification documentation.
