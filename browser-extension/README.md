# MARO Manual Handoff Extension

This Manifest V3 extension fills one short-lived, approved MARO handoff package into the matching active MicroMentor profile. It cannot send messages, process a queue, run in the background, or persist handoff content.

## Install locally

1. Download `maro-manual-handoff-extension.zip` from MARO and extract it.
2. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
3. Select the extracted folder.

## Use

1. Approve the exact message in MARO and choose **Copy for extension**.
2. Open the matching mentor profile and choose **Request Mentorship**.
3. Click the **Customize your message** box once so MicroMentor activates its editor, then open this extension and paste the package.
4. Choose **Fill approved draft**, review the populated message, and send manually on MicroMentor.

The package expires after ten minutes. If the editor is not activated or the form structure changes, the extension copies the approved subject and body for manual paste. It never sends a request.

## Verification status

The fill function passed an approved, unsent test against MicroMentor's live
Flutter editor on 2026-09-04. The in-app browser did not support extension
installation, so the full installed-popup workflow remains unverified. See the
[live check report](../docs/MICROMENTOR_LIVE_CHECK_2026-09-04.md) for the procedure,
observed results, cleanup, and remaining acceptance check.
