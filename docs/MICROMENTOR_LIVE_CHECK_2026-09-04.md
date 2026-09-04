# MicroMentor live compatibility check - 2026-09-04

## Result and scope

The manual handoff's `fillApprovedDraft` function populated the real, signed-in
MicroMentor request editor successfully. This was a controlled, unsent draft test
approved by the operator. It is not a complete installed-extension acceptance
test or a claim of compatibility with every MicroMentor feature.

## Environment and procedure

- Used the Codex in-app Browser and the existing authenticated MicroMentor session.
- Opened a mentor profile from `https://app.micromentor.org/home`, then selected
  **Request Mentorship** and focused **Customize your message**.
- In this desktop layout, the request appeared as a modal while the URL remained
  `/profile/<id>`. The earlier `/profile/invite/<id>` route remains supported by
  the local route checks; it was not the route used in this run.
- Recorded the existing editor text for restoration without saving it in the repo.
- Ran a copy of `fillApprovedDraft` from `browser-extension/popup.js` in a CDP
  isolated world. Its whitespace-normalized source fingerprint matched the local
  function (`c526e778`, FNV-1a consistency check, not a security signature).
- Used this disposable text:

  ```text
  MARO compatibility test - do not send.
  Temporary approved draft for checking the MicroMentor message editor.
  ```

## Observed results

| Check | Result |
| --- | --- |
| Active Flutter textarea receives the body | Passed; `filledBody: true` |
| Separate subject required | No; `filledSubject: false` |
| Flutter editor activation warning | Not needed after focusing the editor |
| Rendered text matches the test draft | Passed in the screenshot and accessibility tree |
| Text survives focus leaving the editor | Passed in the rendered modal |
| Original editor text restored | Passed by exact string comparison |
| Test text removed | Passed; no textarea contained the test marker |
| Form closed and Home restored | Passed |
| MicroMentor WebMCP tools on Home | None exposed |

No Send or Submit control was activated. No mentorship request was submitted.
The original text was restored before closing the modal and returning to Home.

## Remaining acceptance gap

The browser connection exposes no extension installation capability, and the
attempt to use `Extensions.loadUnpacked` returned that the method is unsupported
through raw CDP. Consequently, this run did not install the extension, open its
popup, validate a package through that popup, or execute `chrome.scripting`.
Direct isolated-world execution verifies the editor-facing function, but not the
extension's permissions, popup lifecycle, active-tab selection, or complete MARO
approval-to-fill path.

To finish installed-extension acceptance, use a browser that supports loading
the unpacked extension, create and approve a disposable draft in MARO, copy its
handoff package, open the matching request editor, and use **Fill approved
draft** in the actual popup. Confirm the rendered text and restore the original
draft without sending. The operator has already authorized this unsent test.

## Earlier checks

The preceding 2026-08-29 work passed the extension regression checks, TypeScript
checks, API smoke test, dependency audit, and full release gate, including an
isolated Windows installer install, launch, restart, and upgrade test. Those
checks were not rerun for this documentation-only follow-up. The live check
required no further change to the runtime code.
