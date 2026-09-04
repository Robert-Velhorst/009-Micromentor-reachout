# Operator Runbook

## Start

```powershell
npm.cmd ci
npm.cmd run doctor
npm.cmd run dev
```

`npm run dev` builds the production UI/API and starts the guarded ngrok launcher. A public tunnel starts only with `NGROK_BASIC_AUTH` or explicit `MARO_ALLOW_PUBLIC_TUNNEL=1`. Basic Auth is applied through ngrok Traffic Policy, not a deprecated command-line credential flag. For local-only use run `npm run build` and `npm start`.

## Preflight

1. Confirm the Audit tab shows the expected app version and storage mode.
2. Keep the safety stop paused while importing or reviewing bulk data.
3. Export a workspace backup before restore, reset, retention apply, or upgrade.
4. Check the provider profile and approved message manually before handoff.
5. Record uncertain delivery when evidence is incomplete; never retry until it is resolved.

## Recovery

- Run `npm run doctor`.
- Check `GET /api/readiness` and `GET /api/diagnostics` locally.
- MARO automatically attempts its rolling `.backup` if the primary ledger cannot be parsed/decrypted.
- Use the Audit tab integrity check and sanitized support bundle.
- Restore only a backup that passes preview. Restore and resets require explicit confirmation.

## Docker

```powershell
$env:MARO_LEDGER_PASSPHRASE = "use-a-long-unique-passphrase"
docker compose up --build
```

Open `http://127.0.0.1:8080`. Data is stored in the named `maro-data` volume.

## HAI Connector

1. Set `MARO_HAI_FEED_ENABLED=1` and restart MARO.
2. Verify `GET /api/integrations/hai/manifest` reports `enabled: true`.
3. In the owner-scoped HAI workspace, register `http://host.docker.internal:3000/api/integrations/hai/feed` (or the applicable local MARO port) as an enabled `generic_json_feed`.
4. Run one HAI feed sync and verify the imported external IDs begin with `maro:` and remain review-only.
5. Disable the feed and restart MARO when HAI no longer needs access.

## Windows Installer

Build with the exact Node.js x64 version in `.node-version`. Other build runtimes
are rejected before packaging so the installer cannot silently bundle an
untested Node version. End users do not need to install Node themselves.

```powershell
npm.cmd run installer:win
```

Run `artifacts\MARO-Windows11-Setup.exe`. The installer is currently unsigned; verify its SHA-256 from the release output before distribution.

The installed app keeps replaceable binaries under `%LOCALAPPDATA%\MARO` and durable encrypted data under `%LOCALAPPDATA%\MARO-Data`. Its per-user ledger key is DPAPI protected. Upgrade migrates a legacy `MARO\data` workspace, preserves conflicts as `.legacy-*` files, and retains data on uninstall. Do not delete `MARO-Data` unless a verified workspace backup exists and permanent removal is intentional.

For transfer to another Windows account or computer, export a portable workspace
backup through MARO while the original workspace is still accessible. Install MARO
in the destination account, preview that exported backup, then confirm restore.
Do not assume that copying the encrypted ledger and its DPAPI key file to another
account will work. Exported JSON backups contain personal data; keep them in a
protected location. The automated release test uses two separate installations
and keys in one Windows account; a different-account test remains a separate
acceptance step.

The installer can upgrade MARO while it is open: it runs the ownership-checked stop helper, waits for full process exit, rotates application files atomically, and leaves workspace data untouched. Rerunning the launcher after HAI, tunnel, Host, pause, or version settings change restarts only MARO's recorded server so the new environment takes effect.

For a dedicated cloud endpoint, set both `NGROK_BASIC_AUTH` and `MARO_NGROK_URL` before launching. MARO validates the HTTPS origin, finds only its own target across Agent API ports `4040`-`4050`, and publishes that exact hostname to the server; another local ngrok tool can continue running and unrelated ngrok hostnames remain blocked.
