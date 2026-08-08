# Security

## Trust Model

MARO is a single-user local application. The local operating-system account and data directory are the workspace boundary. Public exposure is optional and must be protected with ngrok Basic Auth. There is no application-level shared-user authentication or RBAC.

## Controls

- Host allowlist and DNS-rebinding defense.
- Cross-site browser mutation rejection and required `X-MARO-Request` marker.
- Request IDs, no-store API responses, one-megabyte JSON limit, and local rate limiting.
- Ten-minute mutation idempotency keyed by method, path, key, and request-body hash.
- CSP, frame denial, no-sniff, no-referrer, and restrictive Permissions Policy.
- Atomic mode-0600 writes, rolling recovery backup, optional AES-256-GCM encryption with scrypt.
- Backup referential-integrity validation and spreadsheet-formula neutralization in CSV exports.
- Approval snapshots, manual delivery evidence, do-not-contact, cooldown, duplicate-send guard, safety stop, and uncertain-delivery resolution.
- Sanitized diagnostics and support bundle that omit record bodies, identities, credentials, and file paths.
- Disabled-by-default HAI feed that is read-only, bounded to 250 action cards, and grants no approval, send, or provider mutation authority.
- Non-root, read-only Docker runtime with all Linux capabilities dropped.

## Secrets

Never commit `MARO_LEDGER_PASSPHRASE`, `NGROK_AUTHTOKEN`, or `NGROK_BASIC_AUTH`. Set them in the process environment or launcher environment. A lost encrypted-ledger passphrase cannot be recovered. Rotate an ngrok credential in the ngrok account, update the environment, and restart MARO.

## Reporting

Stop public exposure, preserve a workspace backup, record the app version and request ID, generate a sanitized support bundle, and report privately to the repository owner. Do not attach the raw ledger unless its personal data is explicitly required and securely transferred.

## Known Boundaries

- Basic Auth protects a tunnel but is not a multi-user authorization system.
- The HAI feed may contain mentor/action context. Enable it only for an owner-scoped local HAI workspace or behind a protected transport.
- In-memory rate limits and idempotency reset on restart and are intentionally scoped to this single-process local runtime.
- Authenticode signing is blocked on certificate availability.
