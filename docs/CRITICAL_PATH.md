# Critical Path

1. Start MARO with `npm run dev` or the Windows launcher.
2. Complete the first-run workspace acknowledgement.
3. Define a project and campaign goal, target mentor type, source, fit criteria, tone, and follow-up rule.
4. Record source searches and add or import mentor profiles.
5. Review match score, reasons, confidence, duplicate warnings, and do-not-contact state.
6. Create a deterministic draft and resolve any quality blocker.
7. Approve the exact subject/body snapshot.
8. Prepare the manual handoff. This is blocked by pause, opt-out, cooldown, stale approval, and duplicate-send guards.
9. Send through the provider UI manually and record evidence, failure, or uncertainty.
10. Resolve uncertain delivery before any retry. Confirmed delivery schedules a follow-up; failure does not.
11. Record a response. `not_interested` sets do-not-contact and cancels scheduled follow-ups.
12. Record an outcome and export campaign history, usage, invoice record, or workspace backup.

## Smoke Proof

`npm test` starts the production bundle on an isolated port with an encrypted temporary ledger and executes this workflow through HTTP. It also tests host rejection, cross-site mutation rejection, stale approvals, duplicate records, malformed JSON, CSV safety, backup recovery, pause, do-not-contact, uncertainty, idempotency, diagnostics, and support-bundle redaction.
