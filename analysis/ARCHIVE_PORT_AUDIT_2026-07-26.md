# MARO Archive Port Audit

Date: 2026-07-26

## Scope

This review compares the two supplied archives with `origin/main` and the
completed operating-ledger branch:

| Archive | Bytes | Entries | SHA-256 |
| --- | ---: | ---: | --- |
| `009 - Micromentor automated outreach.zip` | 1,917,157 | 94 | `8AD72195F1165F9533747EA6C763B3360350EFC999B75B822AFF24CB37D1CFFA` |
| `mentor-messenger-landing.zip` | 54,159,304 | 168 | `29117B2213264CBC16BD496C4DEBABB6EF1F7C9CE1EDF939D953335515F85C02` |

The archives were inspected in isolated temporary directories. No archive code
was executed; JavaScript files received syntax-only checks.

## Findings

### Landing archive

Every path in `mentor-messenger-landing.zip` already exists in `origin/main`.
Fifteen files are byte-identical, 153 are older or otherwise different, and the
current main branch has six additional built files. The archive therefore adds
no missing source path.

Its large image set, duplicate root `src/` frontend, unused UI component
library, public legacy extension archives, and pnpm metadata are the same
surfaces removed by the tool-wide audit. Restoring them would reverse the
59,633,295-byte static-footprint reduction and reintroduce inactive code and
unsafe automated-extension packages.

### Automated outreach archive

The outer archive mixes standalone source files, design notes, test harnesses,
and five nested ZIP variants. It is not a coherent release:

- Root `background.js`, `content.js`, and `popup.js` contain literal truncation
  artifacts and fail `node --check`.
- The nested `mentor-messenger-magic-complete.zip` JavaScript parses, but its
  manifest starts with a JavaScript comment and is not valid JSON.
- That manifest also references absent icons, `content.css`, and template
  resources, so the package cannot load as supplied.
- The extension requests persistent `storage`, `tabs`, `scripting`, and
  MicroMentor host access, injects content scripts, queues messages, and invokes
  `sendButton.click()`.
- Several platform integrations and resource measurements are explicitly
  placeholders or simulations.
- The storage helper keeps its exportable encryption key in the same extension
  storage as the encrypted values, so it does not protect data from an attacker
  who can read that storage.
- The archive itself says MicroMentor API availability, automation rules, rate
  limits, and retention behavior are unknown.

## Port Decisions

| Archive concept | Current MARO equivalent | Decision |
| --- | --- | --- |
| Message templates and personalization | Campaign-aware draft generation, editable drafts, unresolved-token checks, personalization checks, approval snapshots | Already covered; do not import the extension-local implementation |
| Queue and scheduled follow-ups | Persisted draft, approval, manual-attempt, response, and follow-up ledger | Already covered with stronger auditability |
| Analytics and reporting | Campaign results, outcomes, usage reports, invoices, and audit history | Already covered with persisted real records |
| Resource monitoring | Process CPU, RSS duration, storage, and observed API-byte measurement | Keep real measurement; reject simulated metrics |
| Backup, migration, and cleanup | Atomic writes, rolling recovery backup, referentially validated restore, scoped reset | Already covered |
| Browser assistance | Ten-minute approved handoff package and least-privilege manual-fill extension | Keep the current manual-only extension |
| Automatic sending | No current equivalent by design | Reject until platform authorization, consent controls, and enforceable limits exist |
| Decorative image bundle and duplicate frontend | None required by the operating console | Reject to preserve the reduced install and runtime footprint |

## Result

No source file from either archive should be copied into MARO. The relevant
product ideas are already implemented more safely in the operating-ledger
branch, while the remaining archive behavior is obsolete, simulated,
incomplete, or outside the approved manual-send boundary.

The correct port to `main` is the completed operating-ledger branch together
with this reconciliation evidence.

## Landing Verification

The landing pass also refreshed dependencies after the registry reported two
new advisories:

- `body-parser` was updated from 1.20.5 to 1.20.6.
- `postcss` was updated from 8.5.15 to 8.5.23.
- `npm audit --audit-level=low` reports zero known vulnerabilities.
- `npm run check:release` passes the TypeScript, production build, encrypted
  API smoke, security-surface, extension, Windows installer build, and isolated
  installer payload checks.
- The regenerated installer SHA-256 is
  `68101A5549A5434B8D7B5EAECE5D917C9ADBDC8279C539AAFA26985A263CDC1B`.
