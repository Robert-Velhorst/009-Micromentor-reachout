# Operator Runbook

## Start

```powershell
npm.cmd ci
npm.cmd run doctor
npm.cmd run dev
```

`npm run dev` builds the production UI/API and starts the guarded ngrok launcher. A public tunnel starts only with `NGROK_BASIC_AUTH` or explicit `MARO_ALLOW_PUBLIC_TUNNEL=1`. For local-only use run `npm run build` and `npm start`.

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

```powershell
npm.cmd run installer:win
```

Run `artifacts\MARO-Windows11-Setup.exe`. The installer is currently unsigned; verify its SHA-256 from the release output before distribution.
