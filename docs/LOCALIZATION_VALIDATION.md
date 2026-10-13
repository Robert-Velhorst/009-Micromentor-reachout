# Localization validation

Updated: 2026-10-13. This is an incremental English/Dutch implementation, not
acceptance of the full Dutch interface or the whole product.

## Implemented coverage

The Language/Taal menu uses the existing workspace preference endpoint. A language
change sends only the locale and updates the interface after acknowledgement. It
does not reload the dashboard, replace message draft edits, change privacy mode,
or replace unsaved safety-setting fields. There is no translation service, extra
runtime dependency, background polling or automatic retry.

The paired catalog currently contains 255 messages covering:

- Header, privacy controls, refresh, setup and outbound-pause notices.
- Six navigation tabs and mentor pagination, including accessible names and
  English/Dutch number formatting.
- Backup export, preview, restore, reset controls and destructive-action
  confirmations. Confirmation and manual-send requirements are unchanged.
- Workspace status notices, which retain their message key so a later language
  change also translates an existing notice.
- Error-boundary recovery and the not-found page. A direct not-found navigation
  independently reads the saved preference because Home is not mounted there.
- Mentor list filters, phases, notes visibility, contact controls, empty states
  and manual mentor entry. Accessible names identify the mentor for each phase,
  notes and notes-visibility control.
- CSV input, column-mapping labels, preview/import results, file-read status and
  missing-name validation. CSV headers and stored status values are unchanged.
  File-read notices retain a translation key, not a translated string.
- Campaign metrics, selection, creation and settings; project creation/editing;
  source registration, outcome updates and discovery-plan controls. Every input,
  textarea and select in these regions has an accessible name. Stored enum values,
  operator text and generated recommendations are unchanged.
- Discovery notices retain message keys and parameters, so existing confirmations
  translate without repeating the action. Source opening uses a native link with
  `target="_blank"` and `rel="noopener noreferrer"`; it does not append the prepared
  query. The notice reports an opening request, not a confirmed popup. The old
  `window.open` return-value test could report a false popup failure with
  `noopener` (see [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/open#noopener)).

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
- `scripts/check-mentor-localization.mjs`, included by the localization gate,
  extracts and renders the actual mentor tab with controlled state and real UI
  components. It checks both locales, empty/filtered/blocked/revealed/unmapped
  states, stable option values, unchanged/escaped operator input, CSV results and
  English language markers for untranslated diagnostics. Only the unrelated
  detail panel is replaced. Actual CSV file handlers are also executed for
  unsupported files, successful reads, failed reads and cancellation.
- `scripts/check-campaign-localization.mjs` renders the actual dashboard, ledger
  and discovery components in both languages. It checks accessible field names,
  stable campaign/source option values, escaped input, empty/unchanged/blocked
  states, completion guards, localized counts/notices and secure native links.
  Actual add/copy/open callbacks are exercised with API and clipboard boundaries;
  opening must not also call `window.open`. Only the unrelated readiness, runtime
  and next-action panels are replaced in the rendering fixture.

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

On 2026-10-13, the updated production assets were checked in a new synthetic
workspace at `http://127.0.0.1:55400/`:

- Unsaved mentor name, internal notes and CSV contents survived Dutch/English
  switching. A synthetic mentor was then created through the actual form.
- Selecting Dutch `Vervolgcontact` and saving retained the machine value
  `follow_up`. The persisted mentor remained visible after subsequent imports
  and a reload; the Dutch language preference was also retained.
- CSV preview reported one candidate without adding a profile; import increased
  the visible count from one to two. The existing import-result notice translated
  on a later English switch without repeating the import.
- Clearing the name-column mapping displayed Dutch validation and disabled import.
  The same warning changed to English on a language switch.
- No browser warning/error console entries were recorded in the checked session.
  The screenshot returned an empty image, so these are interaction/DOM checks,
  not visual acceptance.

The test browser tab and owned server were stopped after verification. The full
Windows release gate, including these automated localization checks, passed in
`artifacts/release-check-mentor-payload-final-2026-10-13.log`.

The campaign/project/source increment was checked on 2026-10-13 against the built
production assets at `http://127.0.0.1:55974/` in another isolated workspace:

- Unsaved project title/description, campaign title/goal and source notes survived
  English-to-Dutch switching unchanged.
- The actual forms created a synthetic project and a campaign linked to it, then
  recorded a synthetic source with a local query, notes and 12 results.
- Selecting `Voltooid` with open readiness checks displayed the translated warning
  and disabled saving. Selecting `Gepauzeerd` allowed saving; after a reload the
  stored value was still `paused` and the campaign goal was unchanged.
- Updating the source to 15 results and new notes persisted after reload.
- Adding three recommended sources disabled further additions. The existing
  confirmation translated to `Recommended sources added: 3` on an English switch.
- All three rendered source links retained their base destination, `_blank` and
  `noopener noreferrer`, without the prepared query. No external links were opened
  in this pass; provider navigation and installed-extension acceptance are separate.
- No warning/error console entries were recorded. Screenshot capture was blank
  again, so visual and responsive acceptance remain open.

The owned test tab and server were stopped. The full release gate passed in
`artifacts/release-check-campaign-localization-2026-10-13.log`, including the new
campaign checks, installed upgrades and independent-key backup recovery. The exact
installer hash is recorded in [production readiness](PRODUCTION_READINESS.md).

## Remaining work

Review/response/billing text, the mentor detail panel, readiness/runtime panels,
generated recommendations, server errors, date/currency consistency and the extension still
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
The mentor/intake increment adds another 2.11 kB gzip, bringing the bundle to
344.66 kB / 97.00 kB gzip. The campaign/project/source increment brings it to
355.06 kB / 99.19 kB gzip, another 2.19 kB compressed. No extra translation
dependency, translation network request or full dashboard refresh is needed when
switching language.
