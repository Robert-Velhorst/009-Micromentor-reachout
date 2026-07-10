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

async function fetchText(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  return {
    response,
    text: await response.text(),
  };
}

function headerValue(response, name) {
  return response.headers.get(name) || "";
}

function assertIncludes(value, expected, message) {
  assert(value.includes(expected), `${message}: missing ${expected}`);
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
  assert(runtime.auth.publicTunnelExplicitlyAllowed === false, "Runtime status unexpectedly reported public tunnel opt-in in smoke test");

  const rootPage = await fetchText("/");
  assert(rootPage.response.status === 200, "Root page did not return HTTP 200");
  assert(!rootPage.text.includes("fonts.googleapis.com"), "Root HTML still references Google Fonts CSS");
  assert(!rootPage.text.includes("fonts.gstatic.com"), "Root HTML still references Google Fonts files");
  assert(!rootPage.text.includes("__manus__/debug-collector"), "Root HTML includes the development debug collector");
  assert(!rootPage.text.match(/\b(?:src|href)=["']https?:\/\//i), "Root HTML includes an external production asset URL");

  const csp = headerValue(rootPage.response, "content-security-policy");
  assertIncludes(csp, "default-src 'self'", "CSP did not keep default sources self-only");
  assertIncludes(csp, "base-uri 'self'", "CSP did not restrict base URI");
  assertIncludes(csp, "frame-ancestors 'none'", "CSP did not block framing");
  assertIncludes(csp, "object-src 'none'", "CSP did not block object embeds");
  assertIncludes(csp, "img-src 'self' data: blob:", "CSP did not restrict image sources");
  assertIncludes(csp, "font-src 'self'", "CSP did not keep fonts self-hosted");
  assertIncludes(csp, "style-src 'self' 'unsafe-inline'", "CSP did not restrict style sources");
  assertIncludes(csp, "script-src 'self'", "CSP did not restrict script sources");
  assertIncludes(csp, "connect-src 'self'", "CSP did not restrict connection sources");
  assert(!csp.includes("fonts.googleapis.com"), "CSP still allows Google Fonts CSS");
  assert(!csp.includes("fonts.gstatic.com"), "CSP still allows Google Fonts files");
  assert(headerValue(rootPage.response, "x-content-type-options").toLowerCase() === "nosniff", "Missing X-Content-Type-Options nosniff header");
  assert(headerValue(rootPage.response, "x-frame-options").toUpperCase() === "DENY", "Missing X-Frame-Options DENY header");
  assert(headerValue(rootPage.response, "referrer-policy").toLowerCase() === "no-referrer", "Missing Referrer-Policy no-referrer header");
  assertIncludes(headerValue(rootPage.response, "permissions-policy"), "camera=()", "Missing restrictive Permissions-Policy header");

  const extensionResponse = await fetch(`${baseUrl}/maro-manual-handoff-extension.zip`);
  const extensionArchive = Buffer.from(await extensionResponse.arrayBuffer());
  assert(extensionResponse.status === 200, "Manual handoff extension archive was not served");
  assertIncludes(headerValue(extensionResponse, "content-type"), "application/zip", "Manual handoff extension did not use a ZIP content type");
  assert(extensionArchive.readUInt32LE(0) === 0x04034b50, "Manual handoff extension archive is not a valid ZIP file");
  assert(extensionArchive.includes(Buffer.from("manifest.json")), "Manual handoff extension archive is missing its manifest");

  const extensionManifest = JSON.parse(fs.readFileSync(path.join(root, "browser-extension", "manifest.json"), "utf8"));
  const extensionPopup = fs.readFileSync(path.join(root, "browser-extension", "popup.js"), "utf8");
  assert(extensionManifest.version === packageJson.version, "Manual handoff extension version does not match the MARO release version");
  assert(!fs.existsSync(path.join(root, "client", "public", "maro-extension.zip")), "Unsafe legacy MARO extension archive is still publicly bundled");
  assert(!fs.existsSync(path.join(root, "client", "public", "mentor-messenger-magic-enhanced.zip")), "Legacy automated-messaging source archive is still publicly bundled");
  assert(!extensionManifest.background, "Manual handoff extension unexpectedly has a background worker");
  assert(!extensionManifest.content_scripts, "Manual handoff extension unexpectedly has persistent content scripts");
  assert(!extensionManifest.host_permissions, "Manual handoff extension unexpectedly requests persistent host access");
  assert(extensionManifest.permissions.includes("activeTab") && extensionManifest.permissions.includes("scripting"), "Manual handoff extension is missing user-triggered fill permissions");
  assert(!extensionManifest.permissions.includes("tabs") && !extensionManifest.permissions.includes("storage"), "Manual handoff extension requests unnecessary persistent permissions");
  assert(!extensionPopup.includes("chrome.storage"), "Manual handoff extension persists sensitive handoff content");
  assert(!extensionPopup.includes("chrome.tabs.sendMessage"), "Manual handoff extension contains a message-send bridge");
  assert(!extensionPopup.includes("fetch("), "Manual handoff extension makes an external network request");

  const legacyApiUtility = fs.readFileSync(path.join(root, "src", "utils", "api.js"), "utf8");
  assert(!legacyApiUtility.includes("/api/messages/${messageId}/send`"), "Legacy API utility still calls the removed bulk send endpoint");
  assert(!legacyApiUtility.includes("method: 'DELETE'"), "Legacy API utility still exposes mentor deletion");
  assert(!legacyApiUtility.includes("method: 'PUT'"), "Legacy API utility still uses unsupported mentor PUT updates");
  assert(legacyApiUtility.includes("/api/messages/${messageId}/send-attempt`"), "Legacy API utility no longer targets manual send-attempt confirmation");
  assert(legacyApiUtility.includes("Manual delivery evidence is required"), "Legacy API utility does not require manual delivery evidence");

  const projectList = await api("/api/projects");
  assert(projectList.projects.length >= 1, "Default project was not available");
  const projectResult = await api("/api/projects", {
    method: "POST",
    body: JSON.stringify({
      title: "Smoke project context",
      description: "Project-linked outreach smoke coverage",
    }),
  });
  assert(projectResult.project.title === "Smoke project context", "Project create did not persist title");
  const updatedProject = await api(`/api/projects/${projectResult.project.id}`, {
    method: "PATCH",
    body: JSON.stringify({ description: "Updated project-linked outreach context" }),
  });
  assert(updatedProject.project.description === "Updated project-linked outreach context", "Project update did not persist description");
  await expectFailure(
    "/api/campaigns",
    {
      method: "POST",
      body: JSON.stringify({
        projectId: "missing-project",
        title: "Invalid project campaign",
        goal: "This should not persist.",
      }),
    },
    404
  );

  const campaignResult = await api("/api/campaigns", {
    method: "POST",
    body: JSON.stringify({
      projectId: projectResult.project.id,
      title: "Smoke mentor operating ledger",
      goal: "Find a practical automation mentor for a local-first outreach workflow.",
      targetMentorType: "Automation and startup operations mentor",
      source: "smoke-test",
      criteriaJson: {
        tone: "direct, practical, respectful",
        followUpAfterDays: 3,
        requiredApproval: true,
        skills: ["automation", "operations"],
        industries: ["technology"],
        locations: ["Amsterdam"],
        minimumFitScore: 72,
      },
    }),
  });
  const campaignId = campaignResult.campaign.id;
  const encryptedLedgerBeforeReads = fs.readFileSync(ledgerFile);
  await api("/api/ledger/summary");
  await api("/api/ledger/summary");
  const encryptedLedgerAfterReads = fs.readFileSync(ledgerFile);
  assert(encryptedLedgerBeforeReads.equals(encryptedLedgerAfterReads), "Read-only summary requests rewrote the encrypted ledger");
  assert(campaignResult.campaign.projectId === projectResult.project.id, "Campaign did not persist selected project");
  assert(campaignResult.campaign.criteriaJson.followUpAfterDays === 3, "Campaign follow-up rule did not persist on create");
  assert(campaignResult.campaign.criteriaJson.tone === "direct, practical, respectful", "Campaign tone did not persist on create");
  assert(campaignResult.campaign.criteriaJson.skills.join(",") === "automation,operations", "Campaign skill criteria did not persist on create");
  assert(campaignResult.campaign.criteriaJson.minimumFitScore === 72, "Campaign fit threshold did not persist on create");
  await expectFailure(
    `/api/campaigns/${campaignId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    },
    409
  );

  const updatedCampaign = await api(`/api/campaigns/${campaignId}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: "Updated smoke mentor operating ledger",
      goal: "Maintain an edited automation mentor campaign goal.",
      targetMentorType: "Edited automation mentor profile",
      source: "edited-smoke-test",
      status: "paused",
      criteriaJson: {
        tone: "direct, practical, edited",
        followUpAfterDays: 5,
        requiredApproval: true,
        skills: ["automation", "operations"],
        industries: ["technology"],
        locations: ["Amsterdam"],
        minimumFitScore: 72,
      },
    }),
  });
  assert(updatedCampaign.campaign.status === "paused", "Campaign update did not persist");
  assert(updatedCampaign.campaign.title === "Updated smoke mentor operating ledger", "Campaign update did not persist title");
  assert(updatedCampaign.campaign.goal === "Maintain an edited automation mentor campaign goal.", "Campaign update did not persist goal");
  assert(updatedCampaign.campaign.targetMentorType === "Edited automation mentor profile", "Campaign update did not persist target mentor type");
  assert(updatedCampaign.campaign.source === "edited-smoke-test", "Campaign update did not persist source");
  assert(updatedCampaign.campaign.criteriaJson.followUpAfterDays === 5, "Campaign update did not persist follow-up rule");
  assert(updatedCampaign.campaign.criteriaJson.tone === "direct, practical, edited", "Campaign update did not persist tone");
  assert(updatedCampaign.campaign.criteriaJson.industries[0] === "technology", "Campaign update did not persist industry criteria");
  assert(updatedCampaign.campaign.criteriaJson.locations[0] === "Amsterdam", "Campaign update did not persist location criteria");

  const initialDiscoveryPlan = await api(`/api/campaigns/${campaignId}/discovery-plan`);
  assert(initialDiscoveryPlan.discoveryPlan.sources.length === 3, "Discovery plan did not generate three focused source routes");
  assert(initialDiscoveryPlan.discoveryPlan.unrecordedCount === 3, "New discovery plan did not report its unrecorded sources");
  assert(
    initialDiscoveryPlan.discoveryPlan.sources.every((source) => source.searchQuery.includes("Automation") || source.searchQuery.includes("automation")),
    "Discovery queries did not use campaign target or skill criteria"
  );
  assert(
    initialDiscoveryPlan.discoveryPlan.sources.every((source) => {
      const launchUrl = new URL(source.launchUrl);
      return !launchUrl.search && !launchUrl.hash && !source.launchUrl.includes(encodeURIComponent(source.searchQuery));
    }),
    "Discovery source URLs leaked the prepared query"
  );
  assert(
    initialDiscoveryPlan.discoveryPlan.sources.every((source) => source.privacyNote.includes("does not transmit this query")),
    "Discovery plan did not explain query privacy"
  );
  await expectFailure(`/api/campaigns/${campaignId}/discovery-plan`, { method: "POST", body: JSON.stringify({}) }, 400);
  const appliedDiscoveryPlan = await api(`/api/campaigns/${campaignId}/discovery-plan`, {
    method: "POST",
    body: JSON.stringify({ confirm: true }),
  });
  assert(appliedDiscoveryPlan.createdSources.length === 3, "Discovery plan did not create its recommended source records");
  assert(appliedDiscoveryPlan.discoveryPlan.unrecordedCount === 0, "Applied discovery plan did not mark recommendations recorded");
  assert(appliedDiscoveryPlan.createdSources.every((source) => source.status === "planned"), "Discovery plan sources were not safely created as planned");
  const repeatedDiscoveryPlan = await api(`/api/campaigns/${campaignId}/discovery-plan`, {
    method: "POST",
    body: JSON.stringify({ confirm: true }),
  });
  assert(repeatedDiscoveryPlan.createdSources.length === 0, "Discovery plan application was not idempotent");
  const plannedDiscoveryDetails = await api(`/api/campaigns/${campaignId}`);
  assert(plannedDiscoveryDetails.readiness.items.some((item) => item.id === "source-search" && item.status === "attention"), "Planned sources incorrectly counted as completed searches");
  assert(plannedDiscoveryDetails.readiness.items.some((item) => item.id === "source-candidates" && item.status === "attention"), "Planned sources incorrectly completed candidate intake readiness");
  assert(plannedDiscoveryDetails.nextActions.some((action) => action.type === "record_source_search" && action.sourceRecordId), "Planned source did not produce a search-outcome next action");

  const sourceResult = await api(`/api/campaigns/${campaignId}/sources`, {
    method: "POST",
    body: JSON.stringify({
      name: "Smoke MicroMentor search",
      sourceType: "MicroMentor",
      searchQuery: "automation mentor operations",
      status: "searched",
      resultsFound: 6,
      importedCount: 0,
      notes: "Manual search record for smoke coverage",
    }),
  });
  assert(sourceResult.source.status === "searched", "Source search create did not persist status");
  assert(sourceResult.source.resultsFound === 6, "Source search create did not persist result count");
  const updatedSource = await api(`/api/sources/${sourceResult.source.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "imported", importedCount: 2, notes: "Imported two from smoke source" }),
  });
  assert(updatedSource.source.status === "imported", "Source search update did not persist status");
  assert(updatedSource.source.importedCount === 2, "Source search update did not persist imported count");
  const sourceList = await api(`/api/campaigns/${campaignId}/sources`);
  assert(sourceList.sources.some((source) => source.id === sourceResult.source.id), "Campaign source list did not include source record");
  assert(sourceList.sources.length === 4, "Campaign source list did not include the applied discovery plan");
  const sourceActions = await api(`/api/campaigns/${campaignId}/actions`);
  assert(
    sourceActions.actions.some(
      (action) =>
        action.type === "add_mentors" &&
        action.sourceRecordId === sourceResult.source.id &&
        action.title.includes("Import 4 mentor candidates")
    ),
    "Next actions did not recommend importing remaining source candidates"
  );

  const mentorResult = await api(`/api/campaigns/${campaignId}/mentors`, {
    method: "POST",
    body: JSON.stringify({
      name: "Ada Tester",
      company: "Ledger Labs",
      headline: "Startup automation advisor",
      bio: "Advisor with automation, operations, and outreach workflow experience.",
      skills: "automation, operations, outreach",
      industries: "technology, software",
      location: "Amsterdam",
      profileUrl: "https://classic.micromentor.org/mentors/ada-tester",
      sourceRecordId: sourceResult.source.id,
    }),
  });
  assert(mentorResult.assessment.score >= 72, "Structured mentor assessment did not meet the campaign fit threshold");
  assert(mentorResult.assessment.reasonsJson.some((reason) => reason.includes("Skill evidence")), "Structured mentor assessment did not explain skill evidence");
  assert(mentorResult.assessment.reasonsJson.some((reason) => reason.includes("Industry evidence")), "Structured mentor assessment did not explain industry evidence");
  assert(mentorResult.assessment.reasonsJson.some((reason) => reason.includes("Location matches")), "Structured mentor assessment did not explain location evidence");
  assert(mentorResult.mentor.sourceRecordId === sourceResult.source.id, "Manual mentor create did not preserve source record link");
  assert(mentorResult.mentor.industries.includes("technology"), "Manual mentor create did not preserve industries");
  assert(mentorResult.mentor.location === "Amsterdam", "Manual mentor create did not preserve location");
  const mentorId = mentorResult.mentor.id;

  const mismatchedCampaign = await api(`/api/campaigns/${campaignId}`, {
    method: "PATCH",
    body: JSON.stringify({
      targetMentorType: "Quantum agriculture advisor",
      criteriaJson: {
        tone: "direct, practical, edited",
        followUpAfterDays: 5,
        requiredApproval: true,
        skills: ["quantum computing"],
        industries: ["agriculture"],
        locations: ["Tokyo"],
        minimumFitScore: 80,
      },
    }),
  });
  assert(mismatchedCampaign.rescoredMentors === 1, "Campaign criteria update did not rescore existing mentors");
  const mismatchedMentor = await api(`/api/mentors/${mentorId}`);
  assert(mismatchedMentor.assessment.score < 80, "Campaign-wide rescore did not lower a mismatched mentor score");
  assert(mismatchedMentor.assessment.risksJson.some((risk) => risk.includes("threshold of 80%")), "Campaign-wide rescore did not explain threshold risk");
  const mismatchedActions = await api(`/api/campaigns/${campaignId}/actions`);
  assert(
    mismatchedActions.actions.some((action) => action.type === "review_fit" && action.mentorProfileId === mentorId),
    "Below-threshold mentor did not receive a fit-review action"
  );

  const restoredCampaign = await api(`/api/campaigns/${campaignId}`, {
    method: "PATCH",
    body: JSON.stringify({
      targetMentorType: "Edited automation mentor profile",
      criteriaJson: {
        tone: "direct, practical, edited",
        followUpAfterDays: 5,
        requiredApproval: true,
        skills: ["automation", "operations"],
        industries: ["technology"],
        locations: ["Amsterdam"],
        minimumFitScore: 72,
      },
    }),
  });
  assert(restoredCampaign.rescoredMentors === 1, "Restoring campaign criteria did not rescore existing mentors");
  const restoredMentor = await api(`/api/mentors/${mentorId}`);
  assert(restoredMentor.assessment.score > mismatchedMentor.assessment.score, "Restored campaign criteria did not refresh mentor fit score");
  const fitSummary = await api("/api/ledger/summary");
  assert(fitSummary.totals.strongMatches === 1, "Ledger summary did not use the campaign strong-fit threshold");

  const updatedMentor = await api(`/api/mentors/${mentorId}`, {
    method: "PATCH",
    body: JSON.stringify({ notes: "=1+1", stage: "matched" }),
  });
  assert(updatedMentor.mentor.notes === "=1+1", "Mentor update did not persist");

  const csvText = [
    "name,company,headline,bio,skills,industries,location,profileUrl,notes",
    '"Grace Hopper","Compiler Co","Systems mentor","Automation, operations, and developer tooling mentor","automation, tooling","technology, software","Amsterdam","https://example.com/grace","quoted csv row"',
    '"Grace Hopper","Compiler Co","Duplicate mentor","Duplicate should be skipped","automation","technology","Amsterdam","https://example.com/grace","duplicate"',
    ',Missing Name Co,No name row,Should skip,operations,technology,Amsterdam,,',
  ].join("\n");
  const importPreview = await api(`/api/campaigns/${campaignId}/mentors/import`, {
    method: "POST",
    body: JSON.stringify({ csvText, preview: true }),
  });
  assert(importPreview.importedCount === 1, "CSV preview did not report exactly one importable row");
  assert(importPreview.skipped.length === 2, "CSV preview did not report skipped duplicate/missing rows");

  const importResult = await api(`/api/campaigns/${campaignId}/mentors/import`, {
    method: "POST",
    body: JSON.stringify({ csvText, sourceRecordId: sourceResult.source.id }),
  });
  assert(importResult.importedCount === 1, "CSV import did not import exactly one mentor");
  assert(importResult.imported[0].sourceRecordId === sourceResult.source.id, "CSV import did not preserve source record link");
  assert(importResult.imported[0].industries.includes("technology"), "CSV import did not preserve industries");
  assert(importResult.imported[0].location === "Amsterdam", "CSV import did not preserve location");
  const sourceAfterCsvImport = await api(`/api/campaigns/${campaignId}/sources`);
  const linkedImportSource = sourceAfterCsvImport.sources.find((source) => source.id === sourceResult.source.id);
  assert(linkedImportSource.importedCount === 3, "Linked source record did not track CSV imported count");
  assert(linkedImportSource.status === "imported", "Linked source record did not remain imported after CSV import");
  const exportResult = await api(`/api/campaigns/${campaignId}/mentors/export`);
  assert(exportResult.csv.includes("Grace Hopper"), "CSV export did not include imported mentor");
  assert(exportResult.csv.startsWith("name,company,headline,bio,skills,industries,location,source,sourceSearch,"), "CSV export did not include structured profile and source search headers");
  assert(exportResult.csv.includes("Smoke MicroMentor search"), "CSV export did not include linked source search name");

  const mappedCsvText = [
    "Full Name,Org,Role,Goal,Sectors,Region,Profile,Internal Notes,Priority,Stage",
    '"Katherine Johnson","Trajectory Co","Navigation advisor","Operations mentor for precise execution","Aerospace","Virginia","https://example.com/katherine","mapping row","high","new"',
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
        industries: "Sectors",
        location: "Region",
        profileUrl: "Profile",
        notes: "Internal Notes",
        priority: "Priority",
        stage: "Stage",
      },
    }),
  });
  assert(mappedImport.importedCount === 1, "Mapped CSV import did not import exactly one mentor");
  assert(mappedImport.imported[0].profileUrl === "https://example.com/katherine", "Mapped profile URL did not persist");
  assert(mappedImport.imported[0].industries[0] === "Aerospace", "Mapped industries did not persist");
  assert(mappedImport.imported[0].location === "Virginia", "Mapped location did not persist");
  assert(mappedImport.imported[0].stage === "new", "Mapped mentor stage did not persist");
  const declineMentorId = mappedImport.imported[0].id;

  const duplicateMentor = await api(`/api/campaigns/${campaignId}/mentors`, {
    method: "POST",
    body: JSON.stringify({
      name: "Ada Tester",
      company: "Ledger Labs",
      headline: "Duplicate profile row",
      bio: "A manually entered duplicate profile for duplicate outreach guard coverage.",
      skills: "automation",
      profileUrl: "javascript:alert(1)",
    }),
  });
  assert(duplicateMentor.duplicateCount >= 1, "Manual duplicate mentor was not detected");
  assert(duplicateMentor.mentor.profileUrl === null, "Unsafe mentor profile URL scheme was not removed");

  const draftResult = await api(`/api/campaigns/${campaignId}/messages`, {
    method: "POST",
    body: JSON.stringify({ mentorProfileId: mentorId }),
  });
  const messageId = draftResult.draft.id;
  assert(draftResult.draft.body.includes("I'll be direct and keep this practical."), "Draft did not apply the campaign tone rule");
  assert(draftResult.draft.body.includes("Maintain an edited automation mentor campaign goal"), "Draft did not preserve the campaign goal");
  assert(!draftResult.draft.body.includes('"..'), "Draft match reason contained duplicate punctuation");
  assert(draftResult.qualityReview.messageDraftId === messageId, "Draft creation did not return a quality review");
  const draftActions = await api(`/api/campaigns/${campaignId}/actions`);
  assert(draftActions.actions.some((action) => action.type === "review_draft" && action.messageDraftId === messageId), "Next actions did not include draft review");
  assert(
    draftActions.actions.some((action) => action.type === "review_duplicate_profile" && action.mentorProfileId === duplicateMentor.mentor.id),
    "Next actions did not identify the duplicate mentor profile"
  );
  assert(
    !draftActions.actions.some((action) => action.type === "draft_message" && action.mentorProfileId === duplicateMentor.mentor.id),
    "Next actions recommended duplicate outreach for an already drafted mentor identity"
  );
  await expectFailure(
    `/api/campaigns/${campaignId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ mentorProfileId: duplicateMentor.mentor.id }),
    },
    409
  );
  const resolvedDuplicate = await api(`/api/mentors/${duplicateMentor.mentor.id}/resolve-duplicate`, {
    method: "POST",
    body: JSON.stringify({ resolutionNote: "Smoke duplicate resolution" }),
  });
  assert(resolvedDuplicate.mentor.stage === "closed", "Resolved duplicate mentor was not closed");
  assert(resolvedDuplicate.canonicalMentor.id === mentorId, "Duplicate was not resolved into the canonical mentor");
  assert(resolvedDuplicate.mentor.notes.includes("Smoke duplicate resolution"), "Duplicate resolution note was not retained");
  const resolvedDuplicateActions = await api(`/api/campaigns/${campaignId}/actions`);
  assert(
    !resolvedDuplicateActions.actions.some((action) => action.type === "review_duplicate_profile" && action.mentorProfileId === duplicateMentor.mentor.id),
    "Resolved duplicate mentor still produced a duplicate review action"
  );
  assert(
    !resolvedDuplicateActions.actions.some((action) => action.type === "draft_message" && action.mentorProfileId === duplicateMentor.mentor.id),
    "Resolved duplicate mentor still produced a draft recommendation"
  );
  await expectFailure(`/api/mentors/${duplicateMentor.mentor.id}/resolve-duplicate`, { method: "POST" }, 409);

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
  const firstHandoff = await api(`/api/messages/${messageId}/handoff`, { method: "POST" });
  assert(firstHandoff.handoff.kind === "maro-manual-handoff", "Approved handoff package has the wrong kind");
  assert(firstHandoff.handoff.version === 1, "Approved handoff package has the wrong version");
  assert(firstHandoff.handoff.messageDraftId === messageId, "Approved handoff package references the wrong message");
  assert(firstHandoff.handoff.profileUrl === "https://classic.micromentor.org/mentors/ada-tester", "Approved handoff package lost the mentor profile URL");
  assert(new Date(firstHandoff.handoff.expiresAt).getTime() > Date.now(), "Approved handoff package was not short-lived");

  const invalidatedApproval = await api(`/api/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({
      subject: firstHandoff.handoff.subject,
      body: `${firstHandoff.handoff.body}\n\nThis approved-content change must require a new review.`,
    }),
  });
  assert(invalidatedApproval.draft.status === "draft", "Editing approved content did not invalidate approval");
  await expectFailure(`/api/messages/${messageId}/handoff`, { method: "POST" }, 409);
  await expectFailure(
    `/api/messages/${messageId}/send-attempt`,
    {
      method: "POST",
      body: JSON.stringify({ deliveryEvidence: "must not accept stale approval" }),
    },
    409
  );
  await api(`/api/messages/${messageId}/approve`, {
    method: "POST",
    body: JSON.stringify({ decisionReason: "Re-approved after content edit" }),
  });
  const refreshedHandoff = await api(`/api/messages/${messageId}/handoff`, { method: "POST" });
  assert(refreshedHandoff.handoff.body.includes("approved-content change"), "Re-approved handoff did not use the current approved snapshot");
  await expectFailure(
    `/api/messages/${messageId}/send-attempt`,
    {
      method: "POST",
      body: JSON.stringify({ status: "failed" }),
    },
    400
  );
  const failedSendAttempt = await api(`/api/messages/${messageId}/send-attempt`, {
    method: "POST",
    body: JSON.stringify({ status: "failed", errorMessage: "Manual handoff window was unavailable" }),
  });
  assert(failedSendAttempt.attempt.status === "failed", "Failed send attempt was not recorded as failed");
  assert(failedSendAttempt.draft.status === "approved", "Failed send attempt should leave the draft approved for retry");
  const followUpsAfterFailedAttempt = await api(`/api/campaigns/${campaignId}/follow-ups`);
  assert(followUpsAfterFailedAttempt.followUps.length === 0, "Failed send attempt should not schedule follow-up");
  const retryActions = await api(`/api/campaigns/${campaignId}/actions`);
  assert(retryActions.actions.some((action) => action.type === "confirm_manual_send" && action.messageDraftId === messageId), "Failed send attempt should keep manual send confirmation open");

  await api(`/api/messages/${messageId}/send-attempt`, {
    method: "POST",
    body: JSON.stringify({ deliveryEvidence: "Confirmed manually in smoke test" }),
  });

  const followUpsAfterSend = await api(`/api/campaigns/${campaignId}/follow-ups`);
  assert(followUpsAfterSend.followUps.length === 1, "Automatic follow-up was not scheduled after send confirmation");
  const scheduledFollowUpDelayDays = Math.round(
    (new Date(followUpsAfterSend.followUps[0].dueAt).getTime() - new Date(followUpsAfterSend.followUps[0].createdAt).getTime()) /
      86400000
  );
  assert(scheduledFollowUpDelayDays === 5, "Automatic follow-up did not use the campaign follow-up rule");
  assert(followUpsAfterSend.followUps[0].suggestedMessage.includes("Maintain an edited automation mentor campaign goal"), "Automatic follow-up did not preserve the campaign goal");
  assert(followUpsAfterSend.followUps[0].suggestedMessage.includes("I'll be direct and keep this practical."), "Automatic follow-up did not preserve the campaign tone");
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
  const followUpDraft = await api(`/api/follow-ups/${manualFollowUp.followUp.id}/draft`, { method: "POST" });
  assert(followUpDraft.draft.status === "draft", "Follow-up draft was not created in review state");
  assert(followUpDraft.draft.body.includes("Manual smoke follow-up."), "Follow-up draft did not use the scheduled follow-up suggestion");
  assert(followUpDraft.followUp.messageDraftId === followUpDraft.draft.id, "Follow-up was not linked to the created draft");
  assert(followUpDraft.qualityReview.status !== "blocked", "Follow-up draft should pass approval-gate quality checks");
  const followUpDraftActions = await api(`/api/campaigns/${campaignId}/actions`);
  assert(followUpDraftActions.actions.some((action) => action.type === "review_draft" && action.messageDraftId === followUpDraft.draft.id), "Follow-up draft did not enter the review queue");
  assert(!followUpDraftActions.actions.some((action) => action.type === "follow_up_due" && action.followUpId === manualFollowUp.followUp.id), "Linked follow-up draft should suppress duplicate due action");
  await expectFailure(`/api/follow-ups/${manualFollowUp.followUp.id}/draft`, { method: "POST" }, 409);
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

  const declinedDraft = await api(`/api/campaigns/${campaignId}/messages`, {
    method: "POST",
    body: JSON.stringify({ mentorProfileId: declineMentorId }),
  });
  await api(`/api/messages/${declinedDraft.draft.id}/approve`, {
    method: "POST",
    body: JSON.stringify({ decisionReason: "Smoke decline path approval" }),
  });
  await api(`/api/messages/${declinedDraft.draft.id}/send-attempt`, {
    method: "POST",
    body: JSON.stringify({ deliveryEvidence: "Confirmed manually for decline path" }),
  });
  const declineFollowUpsBeforeResponse = await api(`/api/campaigns/${campaignId}/follow-ups`);
  const declineFollowUp = declineFollowUpsBeforeResponse.followUps.find((followUp) => followUp.messageDraftId === declinedDraft.draft.id);
  assert(declineFollowUp?.status === "scheduled", "Decline-path follow-up was not scheduled before response");
  await api("/api/responses", {
    method: "POST",
    body: JSON.stringify({
      campaignId,
      mentorProfileId: declineMentorId,
      messageDraftId: declinedDraft.draft.id,
      classification: "not_interested",
      body: "Not a fit right now.",
    }),
  });
  const declineFollowUpsAfterResponse = await api(`/api/campaigns/${campaignId}/follow-ups`);
  const cancelledDeclineFollowUp = declineFollowUpsAfterResponse.followUps.find((followUp) => followUp.id === declineFollowUp.id);
  assert(cancelledDeclineFollowUp?.status === "cancelled", "Not-interested response did not cancel the pending follow-up");

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

  const invoiceActions = await api(`/api/campaigns/${campaignId}/actions`);
  assert(invoiceActions.actions.some((action) => action.type === "generate_invoice_record"), "Next actions did not include invoice report generation");

  const invoiceResult = await api(`/api/campaigns/${campaignId}/invoices`, { method: "POST" });
  assert(invoiceResult.invoiceRecord.invoiceNumber.startsWith("MARO-"), "Invoice report did not include a MARO invoice number");
  assert(invoiceResult.invoiceRecord.finalCost === usageReport.totals.finalCost, "Invoice report final cost did not match usage report");
  assert(invoiceResult.usageReport.invoiceRecords.length === 1, "Generated usage report did not include the invoice snapshot");

  const details = await api(`/api/campaigns/${campaignId}`);
  assert(details.campaign.criteriaJson.followUpAfterDays === 5, "Campaign details did not include follow-up rule");
  assert(details.sourceRecords.length === 4, "Campaign details did not include manual and discovery-plan source records");
  assert(details.sourceRecords[0].searchQuery === "automation mentor operations", "Campaign details source record did not preserve query");
  assert(details.campaign.totalMentors === 4, "Campaign mentor count was not persisted");
  assert(details.campaign.messagesDrafted === 3, "Draft count was not persisted");
  assert(details.campaign.messagesSent === 2, "Sent count was not persisted");
  assert(details.campaign.responsesReceived === 2, "Response count was not persisted");
  assert(details.billingRecords.length === 1, "Billing record was not generated");
  assert(details.invoiceRecords.length === 1, "Invoice record was not generated");
  assert(details.outcomes.length === 1, "Outcome detail was not persisted");
  assert(details.followUps.some((followUp) => followUp.status === "completed"), "Completed follow-up was not persisted");
  assert(details.followUps.some((followUp) => followUp.status === "cancelled"), "Cancelled follow-up was not persisted");
  assert(details.results.totals.contacted === 2, "Campaign results did not include contacted mentor count");
  assert(details.results.totals.booked === 1, "Campaign results did not include booked outcome count");
  assert(details.results.totals.overdueFollowUps === 0, "Campaign results did not clear completed/cancelled follow-ups");
  assert(details.results.rates.responseRate === 100, "Campaign results did not include response rate");
  assert(details.results.rates.bookingRate === 50, "Campaign results did not include booking rate");
  assert(details.results.followUpBreakdown.completed === 1, "Campaign results did not include completed follow-up breakdown");
  assert(details.results.followUpBreakdown.cancelled === 2, "Campaign results did not include cancelled follow-up breakdown");
  assert(details.readiness.score > 0, "Campaign readiness score was not derived");
  assert(details.readiness.totalItems >= 10, "Campaign readiness checklist did not include the operating lifecycle");
  assert(details.readiness.items.some((item) => item.id === "source-candidates" && item.status === "attention"), "Campaign readiness did not flag remaining source candidates");
  assert(details.readiness.items.some((item) => item.id === "invoice-snapshot" && item.status === "complete"), "Campaign readiness did not include completed invoice snapshot");
  assert(Array.isArray(details.nextActions), "Campaign details did not include next actions");
  assert(details.nextActions.some((action) => action.type === "draft_message" || action.type === "generate_cost_record"), "Next actions did not include remaining operational work");
  assert(details.auditEvents.length >= 10, "Audit trail was not recorded");
  const mentorTimeline = await api(`/api/mentors/${mentorId}/timeline`);
  const relationshipTimeline = mentorTimeline.relationshipTimeline;
  assert(relationshipTimeline?.entries.some((entry) => entry.label === "Draft"), "Mentor timeline endpoint did not include the relationship draft timeline");
  assert(relationshipTimeline?.entries.some((entry) => entry.label === "Approval"), "Mentor timeline endpoint did not include the relationship approval timeline");
  assert(relationshipTimeline?.entries.some((entry) => entry.label === "Send"), "Mentor timeline endpoint did not include the relationship send timeline");
  assert(relationshipTimeline?.entries.some((entry) => entry.label === "Response"), "Mentor timeline endpoint did not include the relationship response timeline");
  assert(relationshipTimeline?.entries.some((entry) => entry.label === "Outcome"), "Mentor timeline endpoint did not include the relationship outcome timeline");
  const confirmedSendTimelineEntry = relationshipTimeline.entries.find(
    (entry) => entry.label === "Send" && entry.title === "Manual send confirmed"
  );
  assert(!confirmedSendTimelineEntry?.detail.includes("Confirmed manually in smoke test"), "Relationship timeline exposed delivery evidence outside privacy controls");
  assert(confirmedSendTimelineEntry?.sensitiveText?.includes("Confirmed manually in smoke test"), "Relationship timeline did not preserve delivery evidence behind privacy controls");

  assert(mentorTimeline.relationshipTimeline.mentorProfileId === mentorId, "Mentor timeline endpoint did not return the requested mentor");
  const mentorDetails = await api(`/api/mentors/${mentorId}`);
  assert(mentorDetails.relationshipTimeline.entries.length === relationshipTimeline.entries.length, "Mentor details did not match the dedicated relationship timeline endpoint");

  const haiStatus = await api("/api/integrations/hai/status");
  const haiCampaign = haiStatus.campaigns.find((campaign) => campaign.campaignId === campaignId);
  assert(haiStatus.service === "maro-ledger", "HAI integration status did not identify the MARO ledger service");
  assert(haiStatus.safety.externalSending === "manual_only", "HAI integration status did not preserve manual-only sending policy");
  assert(haiStatus.safety.approvalRequiredBeforeSend === true, "HAI integration status did not expose approval safety policy");
  assert(haiStatus.safety.completionRequiresReadiness === true, "HAI integration status did not expose completion readiness policy");
  assert(haiCampaign, "HAI integration status did not include the campaign snapshot");
  assert(haiCampaign.readiness.score === details.readiness.score, "HAI campaign snapshot readiness did not match campaign details");
  assert(haiCampaign.queue.responsesAwaitingOutcome >= 1, "HAI campaign snapshot did not expose response outcome queue counts");
  assert(haiCampaign.costs.finalCost === usageReport.totals.finalCost, "HAI campaign snapshot did not expose campaign final cost");
  assert(haiStatus.totals.nextActions >= haiCampaign.nextActions.length, "HAI integration totals did not include campaign next actions");

  const historyExport = await api(`/api/campaigns/${campaignId}/history/export`);
  assert(historyExport.filename.endsWith("-campaign-history.csv"), "Campaign history export filename was not generated");
  assert(historyExport.csv.includes("latestMessageStatus"), "Campaign history export did not include message status header");
  assert(historyExport.csv.includes("sourceSearch"), "Campaign history export did not include source search header");
  assert(historyExport.csv.includes("sentAt"), "Campaign history export did not include sent timestamp header");
  assert(historyExport.csv.includes("outcomeStatus"), "Campaign history export did not include outcome status header");
  assert(historyExport.csv.includes("Ada Tester"), "Campaign history export did not include the contacted mentor");
  assert(historyExport.csv.includes("Smoke MicroMentor search"), "Campaign history export did not include linked source search name");
  assert(historyExport.csv.includes("sent"), "Campaign history export did not include sent message state");
  assert(historyExport.csv.includes("booked"), "Campaign history export did not include outcome state");
  assert(historyExport.csv.includes("'=1+1"), "Campaign history export did not neutralize spreadsheet formula content");

  const backup = await api("/api/workspace/backup");
  assert(backup.kind === "maro-workspace-backup", "Workspace backup did not include backup kind");
  assert(backup.summary.mentors === 4, "Workspace backup did not include mentor count");
  assert(backup.summary.sourceRecords === 5, "Workspace backup did not include source record count");
  assert(backup.summary.qualityReviews === 3, "Workspace backup did not include quality review count");
  assert(backup.summary.invoiceRecords === 1, "Workspace backup did not include invoice count");
  const restorePreview = await api("/api/workspace/restore/preview", {
    method: "POST",
    body: JSON.stringify({ backupJson: JSON.stringify(backup) }),
  });
  assert(restorePreview.valid === true, "Workspace restore preview did not validate backup");
  assert(restorePreview.summary.drafts === 3, "Workspace restore preview did not include draft count");
  assert(restorePreview.summary.sourceRecords === 5, "Workspace restore preview did not include source record count");
  assert(restorePreview.summary.qualityReviews === 3, "Workspace restore preview did not include quality review count");
  assert(restorePreview.summary.invoiceRecords === 1, "Workspace restore preview did not include invoice count");
  const missingQualityReviewsBackup = structuredClone(backup);
  delete missingQualityReviewsBackup.ledger.messageQualityReviews;
  await expectFailure("/api/workspace/restore/preview", {
    method: "POST",
    body: JSON.stringify({ backupJson: JSON.stringify(missingQualityReviewsBackup) }),
  }, 400);
  const missingInvoiceRecordsBackup = structuredClone(backup);
  delete missingInvoiceRecordsBackup.ledger.invoiceRecords;
  await expectFailure("/api/workspace/restore/preview", {
    method: "POST",
    body: JSON.stringify({ backupJson: JSON.stringify(missingInvoiceRecordsBackup) }),
  }, 400);
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
  assert(resetQueue.summary.mentors === 4, "Queue reset should preserve mentors");
  const restored = await api("/api/workspace/restore", {
    method: "POST",
    body: JSON.stringify({ backupJson: JSON.stringify(backup), confirm: true }),
  });
  assert(restored.summary.drafts === 3, "Workspace restore did not restore draft count");
  assert(restored.summary.sourceRecords === 5, "Workspace restore did not restore source record count");
  assert(restored.summary.qualityReviews === 3, "Workspace restore did not restore quality review count");
  assert(restored.summary.invoiceRecords === 1, "Workspace restore did not restore invoice count");
  const restoredDetails = await api(`/api/campaigns/${campaignId}`);
  assert(restoredDetails.campaign.messagesDrafted === 3, "Restored campaign draft count was not available");
  assert(restoredDetails.sourceRecords.length === 4, "Restored source records were not available");
  assert(restoredDetails.qualityReviews.length === 3, "Restored quality review was not available");
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
