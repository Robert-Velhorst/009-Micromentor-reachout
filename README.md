# MARO - Micromentor Reachout Console

MARO is a local-first MicroMentor outreach operating ledger for preparing, reviewing, confirming, following up, and costing mentor outreach.

## What It Does

- Manage outreach projects and campaigns.
- Persist mentor profiles, fit scores, message drafts, approvals, manual send confirmations, responses, follow-ups, billing records, and audit events through the local Express API.
- Require approval before a message can be manually confirmed as sent.
- Review draft quality before approval, including unresolved template tokens, personalization coverage, length, reading time, and call-to-action checks.
- Show deterministic next-action recommendations for drafts, approvals, due follow-ups, response outcomes, and resource-cost records.
- Record delivery evidence instead of faking external sends.
- Track response classifications and follow-up suggestions.
- Generate local process-measured resource-cost records using `Resource Cost x 2 = Final Price`.
- Persist invoice/usage-report snapshots for campaign billing transparency without charging anyone.
- Show whether the app is local-only or reachable through ngrok, including a warning when the tunnel is public without basic auth.
- Export, validate, restore, and reset the local workspace with schema-versioned JSON backups.
- Use session privacy mode to hide mentor notes, draft bodies, response text, follow-up text, and delivery evidence until explicitly revealed.
- Open the stored source profile and copy a reviewed draft from the message queue for manual MicroMentor handoff; MARO never auto-sends.
- Keep work local by default in a JSON ledger under `data/`, with optional encryption at rest.

## Local Ledger API

The Express server now exposes operational API routes before serving the frontend:

- `GET /api/health`
- `GET /api/runtime/status`
- `GET /api/workspace/backup`
- `POST /api/workspace/restore/preview`
- `POST /api/workspace/restore`
- `POST /api/workspace/reset`
- `GET /api/ledger/summary`
- `GET /api/actions`
- `GET|POST /api/projects`
- `PATCH /api/projects/:id`
- `GET|POST /api/campaigns`
- `PATCH /api/campaigns/:id`
- `GET /api/campaigns/:id`
- `GET /api/campaigns/:id/actions`
- `GET|POST /api/campaigns/:id/mentors`
- `POST /api/campaigns/:id/mentors/import`
- `GET /api/campaigns/:id/mentors/export`
- `GET|POST /api/campaigns/:id/messages`
- `GET /api/campaigns/:id/follow-ups`
- `GET /api/campaigns/:id/usage-report`
- `GET|POST /api/campaigns/:id/invoices`
- `GET|POST /api/mentors`
- `GET|PATCH /api/mentors/:id`
- `GET|POST /api/messages`
- `PATCH /api/messages/:id`
- `POST /api/messages/:id/approve`
- `POST /api/messages/:id/reject`
- `POST /api/messages/:id/send-attempt`
- `GET|POST /api/responses`
- `GET|POST /api/follow-ups`
- `PATCH /api/follow-ups/:id`
- `POST /api/follow-ups/:id/complete`
- `POST /api/follow-ups/:id/cancel`
- `GET|POST /api/outcomes`
- `POST /api/resource-sessions`
- `POST /api/resource-sessions/:id/end`
- `GET /api/billing`
- `GET /api/invoices`
- `GET /api/audit`

The default persistence file is `data/maro-ledger.json`. Set `MARO_DATA_DIR` to store it elsewhere. Runtime ledger data is ignored by git.

Set `MARO_LEDGER_PASSPHRASE` to encrypt the local ledger file at rest with AES-256-GCM. Existing plaintext ledger files are migrated to an encrypted envelope on the next API read/write when this passphrase is present. Keep the passphrase somewhere safe; MARO cannot recover encrypted ledger data without it. Workspace backups remain portable JSON exports and should be handled as sensitive files.

Resource sessions are process-level local measurements. MARO records Node CPU time, RSS memory over session duration, local ledger file size, and observed API payload bytes. It does not use random simulated usage as billing evidence.

Invoice reports are persisted local ledger snapshots generated from stored billing records. They are audit logged and are not external charges, payment requests, or platform billing actions.

Workspace backups are JSON envelopes with `kind: "maro-workspace-backup"` and `schemaVersion: 1`. Restore validates the required ledger arrays before replacing local data. Reset supports `queue`, `mentors`, and `workspace` scopes and requires explicit confirmation.

Next actions are read-time recommendations derived from persisted ledger state. They do not send messages or mutate external platforms; they point the operator toward review, manual send confirmation, response outcome recording, due follow-up handling, and transparent cost-record generation.

## Requirements

- Windows 11, macOS, or Linux for development.
- Node.js and npm for development.
- ngrok CLI installed and authenticated if you want the default dev command to expose the app through ngrok.

## Development

Install dependencies:

```sh
npm install
```

Run the default ngrok flow:

```sh
npm run dev
```

This builds the production app, starts the local Node server on `127.0.0.1:3000`, then opens an ngrok tunnel to that local server.

For a local Vite-only development server:

```sh
npm run dev:vite
```

## Production Build

```sh
npm run build
npm run start
```

The production server binds to `127.0.0.1` by default. Set `PORT` or `HOST` if you need a different local port or host.

## ngrok

Install and authenticate ngrok first:

```sh
ngrok config add-authtoken <token>
```

Optional basic auth for exposed tunnels:

```sh
set NGROK_BASIC_AUTH=user:password
npm run dev
```

The command center reads `GET /api/runtime/status` to show the local URL, detected ngrok tunnel URL, and basic-auth status. If ngrok is active and `NGROK_BASIC_AUTH` is not set, MARO shows a first-viewport warning before you share the tunnel URL.

## Windows Installer

Build a Windows 11 installer:

```sh
npm run installer:win
```

The generated installer is written to:

```text
artifacts/MARO-Windows11-Setup.exe
```

The installer embeds the built app and a Node runtime, installs MARO into `%LOCALAPPDATA%\MARO`, creates launch shortcuts, starts the local server, opens the browser, and opens an ngrok tunnel automatically when ngrok is available on PATH.

## Checks

```sh
npm run check
npm run build
npm run check:api
```

Security, resource, and feature analysis notes are in `analysis/SECURITY_RESOURCE_FEATURE_REPORT.md`.
