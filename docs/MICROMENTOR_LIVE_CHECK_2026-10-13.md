# MicroMentor live compatibility reconnaissance - 2026-10-13

## Result and scope

Read-only browser navigation confirmed that the current platform's **Explore**
button opens `https://app.micromentor.org/explore` and displays mentor results.
MARO's generated discovery plan now uses that route instead of the classic
directory. This follow-up also inspected the request editor, inbox navigation and
the Academy destination. It is compatibility reconnaissance, not acceptance of
every platform feature or the complete installed-extension workflow.

## Direct evidence

- Opened `https://app.micromentor.org/home` in the Codex in-app browser using the
  existing authenticated session. No credentials were collected or copied.
- WebMCP could not be enumerated by this session. Browser UI/accessibility
  inspection was used instead; this is not evidence that the site has no tools.
- Flutter initially exposed only `Enable accessibility`. Clicking it did not
  change the accessible page; pressing Enter on that same button exposed the
  page navigation. No injected page script or provider API was used.
- Activated **Explore** and verified the resulting URL and mentor-results view.
- Opened a mentor profile and its **Request Mentorship** composer without
  changing the provider-generated draft. The live Flutter dialog exposed exactly
  one visible editable `TEXTAREA`; it had no label, name, id or placeholder. The
  app profile route included query parameters, while MARO's existing comparison
  code normalizes the supported profile path and intentionally ignores those
  parameters. This matches the existing selector fallback for a sole visible
  textarea, but does not prove the installed extension can inject into it.
- Opened the Inbox landing view. The app exposed Chats, Invites and Archived
  chats navigation, and received/sent invite tabs. No chat or invite content was
  opened or copied. This confirms navigation only, not chat/invite workflows.
- Opened **Trainings**, which launched `academy.micromentor.org/courses` in a
  separate tab. The Academy overview exposed Overview/Ongoing/Completed views
  and five recommended modules; the account showed zero ongoing and completed
  courses. No course was started. MARO does not automate Academy workflows.
- The account menu exposed Vacation mode, Account settings and Help center. No
  setting was changed and no help page was opened.
- No mentorship request or message was submitted. The temporary app and Academy
  tabs created during this inspection were closed afterwards.

No personal profile or inbox details are copied into this evidence file. This
pass does not establish installed-extension operation, visual, responsive or
screen-reader acceptance, or the behavior of inbox, account, help or training
actions beyond the navigation explicitly listed above.

## Code and regression coverage

- `server/ledger.ts` generates the current Explore start URL and describes only
  the observed browse-and-review workflow. It no longer asserts specific classic
  directory filters are present on the new platform.
- `scripts/check-ledger-api.mjs` asserts the exact generated MicroMentor URL.
  It failed against the previous built server with the expected route assertion
  (`artifacts/check-explore-route-before-2026-10-13.log`).
- Existing API assertions still require launch URLs without a query or fragment,
  and preserve an existing classic mentor profile URL through an approved handoff.
  Popup regression tests cover the current app's profile and invite routes,
  wrong-recipient blocking, query-insensitive matching, the sole-editor Flutter
  fallback and refusal on inbox/non-profile routes, including a same-brand
  Academy URL. This change does not migrate or rewrite stored profiles, source
  queries or recipient-matching rules.
- The rebuilt local browser displayed the exact Explore link in Dutch, with
  `_blank` and `noopener noreferrer`; the console contained no warning/error
  entries. The link was inspected without transmitting a prepared query.
- The full pinned-runtime Windows release gate passed in
  `artifacts/release-check-explore-route-2026-10-13.log`, including the new route
  assertion, the retained classic profile handoff assertion, installed upgrades
  and independent-key backup recovery. Artifact hash and remaining release gates
  are recorded in [production readiness](PRODUCTION_READINESS.md).

The browser extension was not installed in the permitted browser context, so the
popup-to-`chrome.scripting` handoff remains unverified. Direct navigation and
simulated browser API tests do not close that gap. MARO's supported live workflow
is limited to reviewing a mentor and filling one approved draft in that mentor's
request form; it does not automate Inbox/Chats, invite decisions, Academy courses,
account settings or message sending.
