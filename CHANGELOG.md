# Changelog

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
