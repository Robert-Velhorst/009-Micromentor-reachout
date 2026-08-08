# UI Action Audit

| Surface | Action | API | Guard/result |
| --- | --- | --- | --- |
| First run | Complete setup | `PATCH /api/workspace/settings` | Audited durable acknowledgement |
| Header | Pause/resume outbound | `PATCH /api/workspace/settings` | Environment pause cannot be cleared in UI |
| Campaign | Create/edit/status | `/api/campaigns` | Required fields; completion readiness gate |
| Sources | Plan/create/update | discovery/source endpoints | Manual search only; no scraping |
| Mentors | Add/import/edit/resolve duplicate | mentor endpoints | URL/CSV validation and identity dedupe |
| Mentors | Do not contact/allow | `PATCH /api/mentors/:id` | Cancels scheduled follow-ups; blocks outreach |
| Review | Edit/approve/reject | message endpoints | Quality and exact-snapshot gates |
| Review | Prepare handoff | `POST /api/messages/:id/handoff` | Pause, DNC, cooldown, duplicate, approval gates |
| Review | Confirm/fail send | send-attempt endpoint | Evidence required; no provider send occurs |
| Responses | Classify reply | `POST /api/responses` | Not interested becomes DNC |
| Follow-up | Schedule/edit/complete/cancel/draft | follow-up endpoints | DNC blocks creation/drafting |
| Billing | Usage/invoice/export | usage/invoice endpoints | Local record only; no charge |
| Audit | Integrity/support/backup/restore/reset | workspace endpoints | Confirmation and audit requirements |
| Runtime | Copy local/public URL | runtime status | Public warning when Basic Auth absent |

Browser verification must confirm every enabled control creates either a visible result, a download, navigation, or a descriptive error. Disabled controls must have a state-based reason.
