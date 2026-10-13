# Uncertain delivery validation

Updated: 2026-10-13. Scope: one local operator, manual delivery, synthetic test
data. This is not proof of actual MicroMentor delivery or whole-platform support.

## Operator workflow

1. Review and approve the exact subject/body before manual handoff.
2. If the send may have happened but cannot be confirmed, record uncertainty in
   Review, with a description. Do not resend or record failure as a workaround.
3. Open the workspace-wide Uncertain deliveries section. It includes attempts
   outside the selected campaign. Check the actual platform yourself.
4. Select confirmed sent only with delivery evidence. Select not sent only after
   verifying that outcome. Both require a note and the verification checkbox.
5. Confirmed resolution updates the original attempt, marks the draft sent and
   schedules one follow-up. Failed resolution retains the approved draft and
   removes this attempt's uncertainty block. Other safety checks still apply.
6. If a write result is unknown, retain the note and refresh before another
   submission. There is no automatic write retry.

## Enforced boundaries

- The server blocks new drafts, approvals, handoffs and confirmed sends for
  directly matching mentor identity IDs or normalized nonempty profile URLs in
  any campaign. A zero cooldown does not disable this guard. Unrelated mentors
  remain available. Matching is not a transitive graph closure or fuzzy name match.
- The unresolved draft's content and rejection state are frozen. Confirmation
  requires the original approved snapshot, not merely an approved status.
- Resolution ignores only its own uncertain attempt. Other uncertainty, opt-out,
  pause, cooldown and existing confirmed-outreach checks are not bypassed.
- Resolving as failed requires a nonblank verification note. The prior uncertainty
  remains in the audit before-state. A repeated resolution fails instead of
  creating another follow-up.
- The dashboard exposes workspace-wide uncertain attempts and blocked profile
  IDs. Readiness and recommendations request reconciliation instead of more
  outreach. Copy controls and old clipboard fallbacks are disabled/hidden while
  blocked. The profile remains inspectable where a URL exists.
- Notes are hidden by default with privacy mode enabled. Explicit reveal/hide
  controls expose them locally; this is display privacy, not removal from the
  authorized dashboard response. Failed-resolution notes also use these controls.
- No storage migration, background poller, provider call or runtime dependency
  was added. Dashboard safety indexing is linear in the scanned collections and
  exits early when no uncertain attempts exist.

## Automated evidence

`scripts/check-ledger-api.mjs` runs against a real isolated encrypted API:

- Same identity and URL-only aliases in a second campaign are blocked at zero
  cooldown; unrelated handoff still succeeds. Rejected outreach leaves the
  encrypted ledger byte-identical.
- Dashboard global coverage and campaign readiness/recommendation changes are
  asserted. Original approval, content-edit/rejection blocking, blank-evidence
  rejection, explicit failure release, pause and replay protection are covered.
- Portable restore retains the block. A deliberately changed approved body in
  a restored legacy fixture cannot be confirmed. Successful confirmation creates
  exactly one follow-up and updates the original attempt.
- The failing pre-fix guard check is recorded locally in
  `artifacts/check-uncertain-guard-before-2026-10-13.log`.

`scripts/check-delivery-controls.mjs` is included in the localization/release gate:

- Actual React controls render in English/Dutch with stable outcome values,
  hidden context absent from markup, required verification and pause guards.
- Actual submission closures preserve evidence on errors, require refresh,
  suppress rapid duplicate clicks and never automatically retry.
- Actual ReviewColumn copy controls, profile inspection and fallback visibility
  are checked. Failed-resolution notes remain hidden until revealed or privacy
  mode is off; hiding a draft also hides its clipboard fallback.
- A browser-discovered privacy regression failed before the fix in
  `artifacts/check-delivery-privacy-before-2026-10-13.log` and passes afterward.

## Browser evidence

On 2026-10-13, built production assets were exercised at the temporary address
`http://127.0.0.1:50503/` with a fresh encrypted synthetic workspace:

- Created Synthetic Delivery QA, generated and approved a local draft, then
  recorded uncertainty. A global warning and reconciliation section appeared.
- Selecting not sent and entering a note did not enable submission until the
  verification checkbox was checked. Switching English to Dutch preserved the
  selected outcome and note, demonstrated by the saved failure record.
- Failed resolution removed the uncertainty section and left the draft approved.
  The initial browser run found that the legacy failed-attempt display exposed
  the verification note. After repair and production rebuild, reload hid it;
  explicit reveal/hide worked and the note disappeared again from rendered text.
- Revealing the approved body enabled copy after failed resolution. Recording a
  second uncertainty disabled both copy controls even with the body still visible.
- Confirmed resolution required a nonempty note in addition to the checkbox.
  The synthetic confirmed record left both review queues, persisted after reload
  and appeared with one scheduled follow-up. No real provider send occurred.
- No browser warning/error console entries were reported in the checked session.

A second synthetic mentor, Synthetic Lost Ack QA, exercised lost acknowledgements
in the same browser and encrypted workspace. Browser CDP interception was limited
to the local API response stage, never document navigation or external traffic:

1. After the record-uncertainty POST reached HTTP 200, its response was failed with
   `ConnectionClosed` before the UI received it. The UI retained the note, showed
   outcome-unknown feedback, blocked handoff and disabled repeat submission.
2. Explicit Refresh ledger recovered exactly one uncertain attempt from the
   server. No record-uncertainty retry was submitted.
3. The confirmed-resolution POST was likewise intercepted at HTTP 200 and failed.
   The verification note remained unchanged and repeat resolution was disabled.
4. Explicit refresh removed the already-resolved attempt and the approved draft
   from Review. Reload followed by Inspect showed one send attempt, confirmed
   status and one scheduled follow-up for this mentor.
5. Note preservation was verified after using the ordinary Reveal buttons; masked
   password-input inspection is redacted by browser tooling and is not evidence
   of the note's actual content. Interception was cleared with empty patterns.

This proves these two controlled browser/API post-save failure paths, not arbitrary
network interruptions, concurrent stale refreshes or installed ngrok behavior.

These are DOM/interaction checks. They do not certify visual responsiveness,
screen-reader behavior, physical network-loss recovery or installed-extension usage.
The screenshot capture returned a blank image, so no screenshot acceptance is claimed.
The mentor-detail counter includes attempts of all outcomes; its label explicitly
says Send attempts / Verzendpogingen, not confirmed deliveries.

## Remaining acceptance and limits

The full pinned-Node Windows release gate passed after the final changes in
`artifacts/release-check-delivery-accepted-2026-10-13.log`, including dependency
audit, both TypeScript checks, all API/component regressions, installed upgrades
and fresh-key recovery. The current unsigned installer is identified by its hash
in [production readiness](PRODUCTION_READINESS.md). The temporary browser tab and
owned test server were closed; no public tunnel or real message was created.

- Already copied text and offline extension packages cannot be revoked. The
  operator must stop using them when delivery is uncertain. New server handoffs
  are blocked; this is not a remote kill switch for previously issued content.
- The operator supplies delivery evidence. MARO neither verifies a provider inbox
  nor sends a message. No real platform writes were performed for these checks.
- The controlled browser post-save failures above and real-HTTP request failure
  tests are not installed-runtime/real-ngrok outage acceptance. Concurrent stale
  dashboard responses, failure before server commit and real connection outages
  still need broader end-to-end acceptance. Server guards remain authoritative.
- Previously inconsistent imported/legacy records can fail closed. Do not change
  an unknown outcome to failed merely to unblock them; preserve the backup and
  investigate the evidence before repair.
- Privacy checks here cover the touched controls, not an exhaustive privacy audit
  of every existing review, response, billing or audit surface.
- Clean Windows/other-account installation, live installed-extension behavior,
  independent security review and sustained operational acceptance remain open.
