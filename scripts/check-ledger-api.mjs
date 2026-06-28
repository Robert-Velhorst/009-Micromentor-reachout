import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataDir = path.join(root, "artifacts", "smoke-ledger-data");
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

  const runtime = await api("/api/runtime/status");
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

  const draftResult = await api(`/api/campaigns/${campaignId}/messages`, {
    method: "POST",
    body: JSON.stringify({ mentorProfileId: mentorId }),
  });
  const messageId = draftResult.draft.id;

  const editedDraft = await api(`/api/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      subject: "Edited smoke subject",
      body: `${draftResult.draft.body}\n\nSmoke edit.`,
    }),
  });
  assert(editedDraft.draft.subject === "Edited smoke subject", "Draft edit did not persist");

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
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      suggestedMessage: "Manual smoke follow-up.",
    }),
  });
  await api(`/api/follow-ups/${manualFollowUp.followUp.id}/cancel`, { method: "POST" });

  await api("/api/responses", {
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

  const details = await api(`/api/campaigns/${campaignId}`);
  assert(details.campaign.totalMentors === 2, "Campaign mentor count was not persisted");
  assert(details.campaign.messagesDrafted === 1, "Draft count was not persisted");
  assert(details.campaign.messagesSent === 1, "Sent count was not persisted");
  assert(details.campaign.responsesReceived === 1, "Response count was not persisted");
  assert(details.billingRecords.length === 1, "Billing record was not generated");
  assert(details.outcomes.length === 1, "Outcome detail was not persisted");
  assert(details.followUps.some((followUp) => followUp.status === "completed"), "Completed follow-up was not persisted");
  assert(details.followUps.some((followUp) => followUp.status === "cancelled"), "Cancelled follow-up was not persisted");
  assert(details.auditEvents.length >= 10, "Audit trail was not recorded");

  console.log(
    JSON.stringify(
      {
        ok: true,
        campaignId,
        mentorId,
        messageId,
        finalCost: details.billingRecords[0].finalCost,
        outcomes: details.outcomes.length,
        auditEvents: details.auditEvents.length,
      },
      null,
      2
    )
  );
} finally {
  server.kill();
}
