import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const dataDir = path.join(root, "artifacts", "smoke-ledger-data");
const ledgerFile = path.join(dataDir, "maro-ledger.json");
const port = Number(process.env.MARO_SMOKE_PORT || 3197);
const baseUrl = `http://127.0.0.1:${port}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForServer() {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // Retry until the local server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Smoke server did not start in time");
}

async function api(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || `Request failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function expectFailure(pathname, options, status) {
  try {
    await api(pathname, options);
  } catch (error) {
    assert(error.status === status, `Expected ${status} from ${pathname}, got ${error.status || error.message}`);
    return;
  }
  throw new Error(`Expected ${pathname} to fail with ${status}`);
}

fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });

const server = spawn(process.execPath, ["dist/index.cjs"], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: String(port),
    MARO_DATA_DIR: dataDir,
    MARO_LEDGER_PASSPHRASE: "smoke-test-ledger-passphrase",
  },
  shell: false,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

server.stdout.on("data", (chunk) => process.stdout.write(chunk));
server.stderr.on("data", (chunk) => process.stderr.write(chunk));

try {
  await waitForServer();

  const health = await api("/api/health");
  assert(health.ok === true, "Health endpoint did not report ok");
  assert(health.persistence === "encrypted-json", "Health endpoint did not report encrypted ledger persistence");
  assert(health.storage?.encrypted === true, "Health endpoint did not report encrypted storage");
  assert(!("path" in health.storage), "Health storage status should not expose a local filesystem path");

  const runtime = await api("/api/runtime/status");
  assert(runtime.version === packageJson.version, "Runtime status did not report the package app version");
  assert(runtime.localUrl === baseUrl, "Runtime status did not report the smoke local URL");
  assert(runtime.tunnel.active === false, "Runtime status should not report an active tunnel during smoke test");
  assert(runtime.auth.basicAuthConfigured === false, "Runtime status unexpectedly reported basic auth in smoke test");

  const campaignResult = await api("/api/campaigns", {
    method: "POST",
    body: JSON.stringify({
      title: "Smoke mentor operating ledger",
      goal: "Find a practical automation mentor for a local-first outreach workflow.",
      targetMentorType: "Automation and startup operations mentor",
      source: "smoke-test",
    }),
  });
  const campaignId = campaignResult.campaign.id;

  const updatedCampaign = await api(`/api/campaigns/${campaignId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "paused" }),
  });
  assert(updatedCampaign.campaign.status === "paused", "Campaign update did not persist");

  const mentorResult = await api(`/api/campaigns/${campaignId}/mentors`, {
    method: "POST",
    body: JSON.stringify({
      name: "Ada Tester",
      company: "Ledger Labs",
      headline: "Startup automation advisor",
      bio: "Advisor with automation, operations, and outreach workflow experience.",
      skills: "automation, operations, outreach",
    }),
  });
  assert(mentorResult.assessment.score >= 35, "Mentor assessment was not created");
  const mentorId = mentorResult.mentor.id;

  const updatedMentor = await api(`/api/mentors/${mentorId}`, {
    method: "PATCH",
    body: JSON.stringify({ notes: "Strong test fit", stage: "matched" }),
  });
  assert(updatedMentor.mentor.notes === "Strong test fit", "Mentor update did not persist");

  const csvText = [
    "name,company,headline,bio,skills,profileUrl,notes",
    '"Grace Hopper","Compiler Co","Systems mentor","Automation, operations, and developer tooling mentor","automation, tooling","https://example.com/grace","quoted csv row"',
    '"Grace Hopper","Compiler Co","Duplicate mentor","Duplicate should be skipped","automation","https://example.com/grace","duplicate"',
    ',Missing Name Co,No name row,Should skip,operations,,',
  ].join("\n");
  const importPreview = await api(`/api/campaigns/${campaignId}/mentors/import`, {
    method: "POST",
    body: JSON.stringify({ csvText, preview: true }),
  });
  assert(importPreview.importedCount === 1, "CSV preview did not report exactly one importable row");
  assert(importPreview.skipped.length === 2, "CSV preview did not report skipped duplicate/missing rows");

  const importResult = await api(`/api/campaigns/${campaignId}/mentors/import`, {
    method: "POST",
    body: JSON.stringify({ csvText }),
  });
  assert(importResult.importedCount === 1, "CSV import did not import exactly one mentor");
  const exportResult = await api(`/api/campaigns/${campaignId}/mentors/export`);
  assert(exportResult.csv.includes("Grace Hopper"), "CSV export did not include imported mentor");

  const mappedCsvText = [
    "Full Name,Org,Role,Goal,Profile,Internal Notes,Priority,Stage",
    '"Katherine Johnson","Trajectory Co","Navigation advisor","Operations mentor for precise execution","https://example.com/katherine","mapping row","high","new"',
  ].join("\n");
  const mappedImport = await api(`/api/campaigns/${campaignId}/mentors/import`, {
    method: "POST",
    body: JSON.stringify({
      csvText: mappedCsvText,
      columnMap: {
        name: "Full Name",
        company: "Org",
        headline: "Role",
        bio: "Goal",
        profileUrl: "Profile",
        notes: "Internal Notes",
        priority: "Priority",
        stage: "Stage",
      },
    }),
  });
  assert(mappedImport.importedCount === 1, "Mapped CSV import did not import exactly one mentor");
  assert(mappedImport.imported[0].profileUrl === "https://example.com/katherine", "Mapped profile URL did not persist");
  assert(mappedImport.imported[0].stage === "new", "Mapped mentor stage did not persist");

  const draftResult = await api(`/api/campaigns/${campaignId}/messages`, {
    method: "POST",
    body: JSON.stringify({ mentorProfileId: mentorId }),
  });
  const messageId = draftResult.draft.id;
  assert(draftResult.qualityReview.messageDraftId === messageId, "Draft creation did not return a quality review");
  const draftActions = await api(`/api/campaigns/${campaignId}/actions`);
  assert(draftActions.actions.some((action) => action.type === "review_draft" && action.messageDraftId === messageId), "Next actions did not include draft review");

  const blockedDraft = await api(`/api/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      subject: "Question for {UnknownToken}",
      body: "Hi {UnknownToken}, this draft still has a broken template variable.",
    }),
  });
  assert(blockedDraft.qualityReview.status === "blocked", "Broken template token did not block message quality");
  const blockedActions = await api(`/api/campaigns/${campaignId}/actions`);
  assert(blockedActions.actions.some((action) => action.type === "fix_blocked_draft" && action.messageDraftId === messageId), "Next actions did not include blocked draft repair");
  await expectFailure(
    `/api/messages/${messageId}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ decisionReason: "Should not approve broken token" }),
    },
    409
  );

  const editedDraft = await api(`/api/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      subject: "Edited smoke subject",
      body: `${draftResult.draft.body}\n\nGrace, this keeps the request specific and asks for a short practical exchange.`,
    }),
  });
  assert(editedDraft.draft.subject === "Edited smoke subject", "Draft edit did not persist");
  assert(editedDraft.qualityReview.status !== "blocked", "Repaired draft should not remain blocked");

  await expectFailure(
    `/api/messages/${messageId}/send-attempt`,
    {
      method: "POST",
      body: JSON.stringify({ deliveryEvidence: "manual smoke evidence" }),
    },
    409
  );

  await api(`/api/messages/${messageId}/approve`, {
    method: "POST",
    body: JSON.stringify({ decisionReason: "Smoke approval" }),
  });
  const approvedActions = await api(`/api/campaigns/${campaignId}/actions`);
  assert(approvedActions.actions.some((action) => action.type === "confirm_manual_send" && action.messageDraftId === messageId), "Next actions did not include manual send confirmation");

  await api(`/api/messages/${messageId}/send-attempt`, {
    method: "POST",
    body: JSON.stringify({ deliveryEvidence: "Confirmed manually in smoke test" }),
  });

  const followUpsAfterSend = await api(`/api/campaigns/${campaignId}/follow-ups`);
  assert(followUpsAfterSend.followUps.length === 1, "Automatic follow-up was not scheduled after send confirmation");
  await api(`/api/follow-ups/${followUpsAfterSend.followUps[0].id}/complete`, { method: "POST" });

  const manualFollowUp = await api("/api/follow-ups", {
    method: "POST",
    body: JSON.stringify({
      campaignId,
      mentorProfileId: mentorId,
      messageDraftId: messageId,
      dueAt: new Date(Date.now() - 60000).toISOString(),
      suggestedMessage: "Manual smoke follow-up.",
    }),
  });
  const dueActions = await api(`/api/campaigns/${campaignId}/actions`);
  assert(dueActions.actions.some((action) => action.type === "follow_up_due" && action.followUpId === manualFollowUp.followUp.id), "Next actions did not include due follow-up");
  await api(`/api/follow-ups/${manualFollowUp.followUp.id}/cancel`, { method: "POST" });

  const responseResult = await api("/api/responses", {
    method: "POST",
    body: JSON.stringify({
      campaignId,
      mentorProfileId: mentorId,
      messageDraftId: messageId,
      classification: "interested",
      body: "Happy to help.",
      nextAction: "Book a short call.",
    }),
  });
  const responseActions = await api(`/api/campaigns/${campaignId}/actions`);
  assert(responseActions.actions.some((action) => action.type === "record_response_outcome" && action.responseId === responseResult.response.id), "Next actions did not include response outcome decision");

  const outcome = await api("/api/outcomes", {
    method: "POST",
    body: JSON.stringify({
      campaignId,
      mentorProfileId: mentorId,
      status: "booked",
      summary: "Smoke outcome booked.",
      valueLevel: "high",
    }),
  });
  assert(outcome.outcome.status === "booked", "Outcome was not recorded");

  const sessionResult = await api("/api/resource-sessions", {
    method: "POST",
    body: JSON.stringify({ campaignId }),
  });
  const endedSession = await api(`/api/resource-sessions/${sessionResult.session.id}/end`, { method: "POST" });
  assert(endedSession.session.measurementMode === "process", "Resource session did not use process measurement mode");
  assert(endedSession.session.ramGbHours > 0, "Resource session did not capture memory-time usage");
  assert(endedSession.session.bandwidthGb > 0, "Resource session did not capture observed API bytes");

  const usageReport = await api(`/api/campaigns/${campaignId}/usage-report`);
  assert(usageReport.totals.outcomesRecorded === 1, "Usage report did not include outcomes");
  assert(usageReport.totals.finalCost > 0, "Usage report did not include final cost");
  assert(usageReport.measurementNote.includes("process-level"), "Usage report did not disclose process-level measurement");
  assert(Array.isArray(usageReport.invoiceRecords), "Usage report did not include invoice record list");

  const invoiceResult = await api(`/api/campaigns/${campaignId}/invoices`, { method: "POST" });
  assert(invoiceResult.invoiceRecord.invoiceNumber.startsWith("MARO-"), "Invoice report did not include a MARO invoice number");
  assert(invoiceResult.invoiceRecord.finalCost === usageReport.totals.finalCost, "Invoice report final cost did not match usage report");
  assert(invoiceResult.usageReport.invoiceRecords.length === 1, "Generated usage report did not include the invoice snapshot");

  const details = await api(`/api/campaigns/${campaignId}`);
  assert(details.campaign.totalMentors === 3, "Campaign mentor count was not persisted");
  assert(details.campaign.messagesDrafted === 1, "Draft count was not persisted");
  assert(details.campaign.messagesSent === 1, "Sent count was not persisted");
  assert(details.campaign.responsesReceived === 1, "Response count was not persisted");
  assert(details.billingRecords.length === 1, "Billing record was not generated");
  assert(details.invoiceRecords.length === 1, "Invoice record was not generated");
  assert(details.outcomes.length === 1, "Outcome detail was not persisted");
  assert(details.followUps.some((followUp) => followUp.status === "completed"), "Completed follow-up was not persisted");
  assert(details.followUps.some((followUp) => followUp.status === "cancelled"), "Cancelled follow-up was not persisted");
  assert(details.results.totals.contacted === 1, "Campaign results did not include contacted mentor count");
  assert(details.results.totals.booked === 1, "Campaign results did not include booked outcome count");
  assert(details.results.totals.overdueFollowUps === 0, "Campaign results did not clear completed/cancelled follow-ups");
  assert(details.results.rates.responseRate === 100, "Campaign results did not include response rate");
  assert(details.results.rates.bookingRate === 100, "Campaign results did not include booking rate");
  assert(details.results.followUpBreakdown.completed === 1, "Campaign results did not include completed follow-up breakdown");
  assert(details.results.followUpBreakdown.cancelled === 1, "Campaign results did not include cancelled follow-up breakdown");
  assert(Array.isArray(details.nextActions), "Campaign details did not include next actions");
  assert(details.nextActions.some((action) => action.type === "draft_message" || action.type === "generate_cost_record"), "Next actions did not include remaining operational work");
  assert(details.auditEvents.length >= 10, "Audit trail was not recorded");

  const historyExport = await api(`/api/campaigns/${campaignId}/history/export`);
  assert(historyExport.filename.endsWith("-campaign-history.csv"), "Campaign history export filename was not generated");
  assert(historyExport.csv.includes("latestMessageStatus"), "Campaign history export did not include message status header");
  assert(historyExport.csv.includes("sentAt"), "Campaign history export did not include sent timestamp header");
  assert(historyExport.csv.includes("outcomeStatus"), "Campaign history export did not include outcome status header");
  assert(historyExport.csv.includes("Ada Tester"), "Campaign history export did not include the contacted mentor");
  assert(historyExport.csv.includes("sent"), "Campaign history export did not include sent message state");
  assert(historyExport.csv.includes("booked"), "Campaign history export did not include outcome state");
  assert(historyExport.csv.includes("Strong test fit"), "Campaign history export did not include mentor notes");

  const backup = await api("/api/workspace/backup");
  assert(backup.kind === "maro-workspace-backup", "Workspace backup did not include backup kind");
  assert(backup.summary.mentors === 3, "Workspace backup did not include mentor count");
  assert(backup.summary.invoiceRecords === 1, "Workspace backup did not include invoice count");
  const restorePreview = await api("/api/workspace/restore/preview", {
    method: "POST",
    body: JSON.stringify({ backupJson: JSON.stringify(backup) }),
  });
  assert(restorePreview.valid === true, "Workspace restore preview did not validate backup");
  assert(restorePreview.summary.drafts === 1, "Workspace restore preview did not include draft count");
  await expectFailure("/api/workspace/restore/preview", {
    method: "POST",
    body: JSON.stringify({ backupJson: "{not-json" }),
  }, 400);
  await expectFailure("/api/workspace/reset", {
    method: "POST",
    body: JSON.stringify({ scope: "queue" }),
  }, 400);
  const resetQueue = await api("/api/workspace/reset", {
    method: "POST",
    body: JSON.stringify({ scope: "queue", confirm: true }),
  });
  assert(resetQueue.summary.drafts === 0, "Queue reset did not clear drafts");
  assert(resetQueue.summary.invoiceRecords === 0, "Queue reset did not clear invoice records");
  assert(resetQueue.summary.mentors === 3, "Queue reset should preserve mentors");
  const restored = await api("/api/workspace/restore", {
    method: "POST",
    body: JSON.stringify({ backupJson: JSON.stringify(backup), confirm: true }),
  });
  assert(restored.summary.drafts === 1, "Workspace restore did not restore draft count");
  const restoredDetails = await api(`/api/campaigns/${campaignId}`);
  assert(restoredDetails.campaign.messagesDrafted === 1, "Restored campaign draft count was not available");
  assert(restoredDetails.invoiceRecords.length === 1, "Restored invoice record was not available");

  const persistedLedger = fs.readFileSync(ledgerFile, "utf8");
  const persistedEnvelope = JSON.parse(persistedLedger);
  assert(persistedEnvelope.kind === "maro-encrypted-ledger", "Ledger file was not stored as an encrypted envelope");
  assert(persistedEnvelope.algorithm === "aes-256-gcm", "Ledger file did not use the expected encryption algorithm");
  assert(!persistedLedger.includes("Ada Tester"), "Encrypted ledger leaked mentor name plaintext");
  assert(!persistedLedger.includes("Grace Hopper"), "Encrypted ledger leaked imported mentor plaintext");
  assert(!persistedLedger.includes("Smoke mentor operating ledger"), "Encrypted ledger leaked campaign title plaintext");

  console.log(
    JSON.stringify(
      {
        ok: true,
        campaignId,
        mentorId,
        messageId,
        finalCost: restoredDetails.billingRecords[0].finalCost,
        invoices: restoredDetails.invoiceRecords.length,
        outcomes: restoredDetails.outcomes.length,
        auditEvents: restoredDetails.auditEvents.length,
      },
      null,
      2
    )
  );
} finally {
  server.kill();
}
