# MicroMentor discovery route check - 2026-10-13

## Result and scope

Read-only browser navigation confirmed that the current platform's **Explore**
button opens `https://app.micromentor.org/explore` and displays mentor results.
MARO's generated discovery plan now uses that route instead of the classic
directory. This is a start-link compatibility correction, not acceptance of every
platform feature or the complete installed-extension workflow.

## Direct evidence

- Opened `https://app.micromentor.org/home` in the Codex in-app browser using the
  existing authenticated session. No credentials were collected or copied.
- Queried the document's WebMCP capability: no tools were exposed on Home.
- Flutter initially exposed only `Enable accessibility`. Clicking it did not
  change the accessible page; pressing Enter on that same button exposed the
  page navigation. No injected page script or provider API was used.
- Activated the visible **Explore** button, then verified the resulting URL and
  the loaded mentor-results accessibility tree.
- Did not open an inbox, submit a search, request mentorship, edit a profile or
  send a message. Closed the temporary inspection tab afterwards.

No personal profile details are copied into this evidence file. This pass does
not establish visual, responsive or screen-reader acceptance.

## Code and regression coverage

- `server/ledger.ts` generates the current Explore start URL and describes only
  the observed browse-and-review workflow. It no longer asserts specific classic
  directory filters are present on the new platform.
- `scripts/check-ledger-api.mjs` asserts the exact generated MicroMentor URL.
  It failed against the previous built server with the expected route assertion
  (`artifacts/check-explore-route-before-2026-10-13.log`).
- Existing API assertions still require launch URLs without a query or fragment,
  and preserve an existing classic mentor profile URL through an approved handoff.
  This change does not migrate or rewrite stored profiles, source queries or
  extension recipient-matching rules.
- The rebuilt local browser displayed the exact Explore link in Dutch, with
  `_blank` and `noopener noreferrer`; the console contained no warning/error
  entries. The link was inspected without transmitting a prepared query.
- The full pinned-runtime Windows release gate passed in
  `artifacts/release-check-explore-route-2026-10-13.log`, including the new route
  assertion, the retained classic profile handoff assertion, installed upgrades
  and independent-key backup recovery. Artifact hash and remaining release gates
  are recorded in [production readiness](PRODUCTION_READINESS.md).

For the earlier unsent editor-facing test and the remaining installed-extension
gap, see [the September live check](MICROMENTOR_LIVE_CHECK_2026-09-04.md). Direct
navigation and local regression tests do not close that gap.
