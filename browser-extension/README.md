# MARO Manual Handoff Extension

This Manifest V3 extension fills one short-lived, approved MARO handoff package into the matching active MicroMentor profile. It cannot send messages, process a queue, run in the background, or persist handoff content.

## Install locally

1. Download `maro-manual-handoff-extension.zip` from MARO and extract it.
2. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
3. Select the extracted folder.

## Use

1. Approve the exact message in MARO and choose **Copy for extension**.
2. Open the matching mentor profile, open this extension, and paste the package.
3. Choose **Fill approved draft**, review the populated fields, and send manually on MicroMentor.

The package expires after ten minutes. If form filling is unavailable, the extension copies the approved subject and body for manual paste.
