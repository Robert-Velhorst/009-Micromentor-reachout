# Hetzner deployment and data migration

Hetzner is the production deployment target. This guide prepares a migration; it does not establish that infrastructure, DNS, authentication, backups, or a cutover exists.

## Application boundary

The image runs the bundled Node server, serving the interface and `/api` from one origin. The previous static Nginx runtime did not run the ledger API. This application uses a JSON ledger, not a separate database engine. Its schema is managed by the application; upgrading a database server is therefore not applicable here.

Compose publishes only `127.0.0.1:8080`. The application has Host and browser mutation guards but no remote user authentication. Keep the port private. Before remote use, place an authenticated TLS reverse proxy in front of every application and API path, restrict firewall access, and verify unauthorized requests cannot reach ledger data. Configure an explicit `MARO_ALLOWED_HOSTS` allowlist for the actual proxy hostname if the proxy preserves it. Never use a wildcard. Do not treat the mutation header as authentication.

## Preparation

1. Provision an approved Hetzner host, maintained Linux distribution and Docker/Compose versions. Record their versions, firewall rules, image digest and rollback image before cutover. No host provisioning is performed by the repository checks.
2. Store a strong unique `MARO_LEDGER_PASSPHRASE` in the deployment secret store; inject it into Compose without committing it. Compose refuses to start without it. Environment access through the Docker daemon remains privileged; restrict host and Docker access. Retain a recoverable copy of this passphrase independently of the encrypted ledger.
3. Build the reviewed revision with `docker build --tag maro-web:ci .` and run `node scripts/check-container.mjs`. The smoke test uses its own labelled container and volume, synthetic data, no external network, a read-only filesystem and no Linux capabilities. It verifies the interface, API, encryption, request guards and persistence through restart, then removes only its fixtures. It does not validate the operator's actual ledger or reverse proxy.
4. Validate Compose configuration with the secret supplied through the environment. Start the approved deployment only after authentication, data migration and backup arrangements are ready. Do not publish port 8080 on all interfaces.

## Data preservation and cutover

The named `maro-ledger` volume maps to `/data`; `MARO_DATA_DIR=/data`. Preserve the whole data directory, including ledger and rolling backup files. Do not replace or delete an existing volume when updating the image, and never run `docker compose down --volumes` against real data.

Stop writes during the final data copy. Take an encrypted backup of the original directory, record checksums and permissions, and restore a copy into an isolated staging volume. For an already encrypted ledger, retain its original passphrase. For plaintext data, use a staging copy to establish encryption and verify the resulting envelope and application records before transferring it. Do not experiment with the only copy. Workspace backup exports contain plaintext personal data and need separate encryption, access controls and retention rules.

Verify project/campaign counts, drafts, audit history and representative records after migration. Exercise a synthetic draft in staging without confirming sends or contacting providers. Prove backup restoration into another isolated volume using the actual passphrase. Record the result before directing any users to the new host. Monitor loopback `/api/health`, container health, restart counts, disk space and backup age without logging message contents or secrets.

## Rollback

Keep the previous reviewed image and a pre-migration data snapshot. Stop new writes before rollback; restore the matching image and data snapshot into a separate volume and verify it before switching traffic. Do not assume an older application can read a newer schema. Preserve post-cutover data for reconciliation rather than overwriting it. Retire previous infrastructure only after the new service and recovery path are accepted.

## Version and evidence limits

The October 23, 2026 refresh pins Node 26.12.1 and npm 12.2.1, Lucide React 1.61.0 and Vite 8.3.5. Other direct dependencies were compared with public npm `latest` metadata and retained at their current stable versions. The runtime uses the official Alpine Node image, upgrades its OS packages during build and removes unused npm/Yarn. Rebuild and rescan periodically: these pins are a dated baseline, not a promise of future currency or an image vulnerability scan. The generated runtime SBOM describes the bundled production JavaScript dependency graph.
