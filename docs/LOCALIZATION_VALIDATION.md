# Localization validation

Updated: 2026-09-06. This is an incremental English/Dutch implementation, not
acceptance of the full Dutch interface or the whole product.

## Implemented coverage

The Language/Taal menu uses the existing workspace preference endpoint. A language
change sends only the locale and updates the interface after acknowledgement. It
does not reload the dashboard, replace message draft edits, change privacy mode,
or replace unsaved safety-setting fields. There is no translation service, extra
runtime dependency, background polling or automatic retry.

The paired catalog currently contains 66 messages covering:

- Header, privacy controls, refresh, setup and outbound-pause notices.
- Six navigation tabs and mentor pagination, including accessible names and
  English/Dutch number formatting.
- Backup export, preview, restore, reset controls and destructive-action
  confirmations. Confirmation and manual-send requirements are unchanged.
- Workspace status notices, which retain their message key so a later language
  change also translates an existing notice.
- Error-boundary recovery and the not-found page. A direct not-found navigation
  independently reads the saved preference because Home is not mounted there.

The document language follows the selected locale. Untranslated main content is
explicitly marked English, with language overrides for translated regions.
English diagnostic/date details are distinguished within workspace notices.
This metadata is not a screen-reader compatibility certification.

## Safety and concurrency

Locale writes merge only the returned locale into current workspace settings.
They must not overwrite a cooldown field edited while the request was pending.
Home tracks settings-changing operations and rejects older locale reads across
language changes, restoration and reset, including overlapping writes.

The request layer separates in-flight settings reads into write epochs. Reads
within one epoch can still share a connection, but a post-write read cannot reuse
a pre-write request. Invalidation happens on success and uncertain failure for
settings updates, workspace restoration and reset. This prevents an older English
response from undoing a restored Dutch preference. It is not a general solution
for every dashboard race or exactly-once writes.

## Automated evidence

- `npm run check:localization` renders actual React components in English and
  Dutch; verifies catalog parity, number formatting, accessible names, selected
  language, retained status messages and replacement warnings.
- The same check extracts and executes the actual Home handlers against
  controlled API/state boundaries. It checks acknowledged-only changes, no
  language-triggered draft reload, preservation of an unsaved cooldown, both
  refresh completion orders, overlapping writes, failure cleanup, explicit
  reconciliation and restore/reset refreshes.
- `npm run check:client-requests` now has 28 real, isolated HTTP scenarios. Six
  cover settings reads across successful or uncertain settings/restore/reset
  writes. These caught stale request sharing before the fix. Timer and connection
  cleanup remain checked; same-epoch reads still coalesce.
- The encrypted API smoke checks that Dutch persists across requests, unsupported
  locales are rejected without changing the preference, and unrelated safety
  settings are preserved.
- Both `npm test` and `npm run check:release` include localization checks.

The Home handler tests substitute network/state boundaries and are not themselves
rendered-browser tests. They do not imply physical-disk or live-ngrok acceptance.

## Browser evidence

Local synthetic workspaces were used in the Codex in-app browser. No MicroMentor
messages, approvals, profile data or provider writes were involved.

Observed at `http://127.0.0.1:53527/` during the first pass:

- English-to-Dutch switching updated header, navigation and document language.
- An unsaved campaign title survived switching. Unsaved backup JSON survived a
  switch back to English. Reloading restored the saved Dutch preference.
- A direct `/404` navigation displayed the Dutch not-found page.
- English main content and Dutch tab/backup regions had the expected language
  attributes after the corrected build loaded.

Rechecked with the final production assets at `http://127.0.0.1:63330/`:

- Dutch selection and backup controls rendered, with no warning/error console
  entries before the deliberate outage.
- A successful integrity-check notice changed from Dutch to English when the
  language changed, without repeating the integrity check.
- After stopping the owned test server, changing language displayed the
  uncertain-save warning, kept English selected, re-enabled the language menu,
  and preserved the unsaved campaign title.

These addresses identify test sessions, not deployed endpoints. The test servers
were stopped. Reproduce browser checks against a new isolated local workspace.

## Remaining work

Most detailed campaign/source/import/review/response/billing text, generated
recommendations, server errors, date/currency consistency and the extension still
need translation. Operator-entered mentor data and approved message text must not
be machine-translated merely because the interface language changes.

Complete keyboard, real screen-reader, narrow-screen and visual acceptance.
The browser screenshot path returned blank captures or incorrect framing; viewport
overrides also differed from observed dimensions. A partial nonblank desktop
capture and narrow-screen control bounds do not prove responsive visual quality.
No mobile or full accessibility acceptance is claimed.

The primary client bundle increased from 327.95 kB / 91.57 kB gzip in the prior
release log to 337.20 kB / 94.89 kB gzip in the final localization build log.
That is approximately 3.32 kB additional compressed JavaScript. This measures
bundle size, not user-perceived latency or sustained memory/CPU performance.
No extra translation network request or full dashboard refresh is needed when
switching language.
