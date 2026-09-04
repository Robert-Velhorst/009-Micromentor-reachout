import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const artifacts = path.join(root, "artifacts");
fs.mkdirSync(artifacts, { recursive: true });
const sandbox = fs.mkdtempSync(path.join(artifacts, "operational-"));
const dataDir = path.join(sandbox, "data");
const ledgerFile = path.join(dataDir, "maro-ledger.json");
const passphrase = randomUUID();
const mentorCount = 1000;
const report = {
  startedAt: new Date().toISOString(),
  revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim(),
  workingTreeModified: Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", windowsHide: true }).trim()),
  bundleSha256: createHash("sha256").update(fs.readFileSync(path.join(root, "dist/index.cjs"))).digest("hex"),
  nodeVersion: process.version,
  platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  hostMemory: { totalBytes: os.totalmem(), freeBytesAtStart: os.freemem() },
  mentorCount,
  scope: "Isolated synthetic API workload; no provider traffic, browser render measurement, or sustained real-user pilot.",
  measurements: [],
  checks: [],
};
let server;
let serverClosed;
let serverError;
let baseUrl;
let serverOutput = "";

function check(name, fn) {
  fn();
  report.checks.push(name);
  console.log(`PASS ${name}`);
}

async function start() {
  const reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  baseUrl = `http://127.0.0.1:${port}`;
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(MARO_|NGROK_|NODE_OPTIONS$)/i.test(key)));
  serverError = null;
  server = spawn(process.execPath, ["dist/index.cjs"], {
    cwd: root,
    env: { ...env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(port), MARO_DATA_DIR: dataDir, MARO_LEDGER_PASSPHRASE: passphrase },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  serverClosed = new Promise((resolve) => server.once("close", resolve));
  server.on("error", (error) => { serverError = error; });
  for (const stream of [server.stdout, server.stderr]) stream.on("data", (chunk) => {
    serverOutput = (serverOutput + chunk).slice(-12000);
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (serverError) throw serverError;
    assert.equal(server.exitCode, null, `Test server exited: ${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const health = await response.json();
        assert.equal(health.persistence, "encrypted-json");
        return;
      }
    } catch { /* Retry only while the child is starting. */ }
    await delay(100);
  }
  throw new Error(`Test server did not become ready: ${serverOutput}`);
}

async function stop() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  server.kill("SIGKILL");
  await Promise.race([serverClosed, delay(10000, undefined, { ref: false }).then(() => { throw new Error("Test server did not stop"); })]);
}

async function api(route, { method = "GET", body, label, expectedStatus = 200, headers = {} } = {}) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: { "Content-Type": "application/json", "X-MARO-Request": "1", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  if (label) report.measurements.push({ label, durationMs: Number((performance.now() - started).toFixed(2)), responseBytes: Buffer.byteLength(text), status: response.status });
  assert.equal(response.status, expectedStatus, `${method} ${route}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

try {
  await start();
  const dashboard = await api("/api/dashboard");
  const campaignId = dashboard.selectedCampaignId;
  const campaignRoute = `/api/campaigns/${campaignId}`;
  const { session } = await api("/api/resource-sessions", { method: "POST", body: { campaignId } });
  const csvBatch = (offset) => [
    "name,company,headline,bio,skills,industries,location,profileUrl,notes",
    ...Array.from({ length: 100 }, (_, n) => {
      const id = offset + n;
      return `Synthetic Mentor ${id},QA Company ${id},Operations mentor,${"Synthetic operations experience. ".repeat(6)},operations,technology,Test City,https://example.invalid/mentor/${id},Disposable load-test data`;
    }),
  ].join("\n");
  for (let offset = 0; offset < mentorCount; offset += 100) {
    const imported = await api(`${campaignRoute}/mentors/import`, { method: "POST", body: { csvText: csvBatch(offset) }, label: "import-100" });
    assert.equal(imported.importedCount, 100);
  }
  const details = await api(campaignRoute);
  check("All 1000 imported profiles are available", () => assert.equal(details.mentors.length, mentorCount));
  const expectedProfiles = digest(details.mentors);
  const replay = await api(`${campaignRoute}/mentors/import`, { method: "POST", body: { csvText: csvBatch(0) }, label: "duplicate-import" });
  check("Reimport does not duplicate profiles", () => {
    assert.equal(replay.importedCount, 0);
    assert.equal(replay.skipped.length, 100);
  });
  for (let cycle = 0; cycle < 20; cycle++) {
    const loaded = await api(`/api/dashboard?campaignId=${campaignId}`, { label: "dashboard-1000" });
    assert.equal(loaded.details.mentors.length, mentorCount);
    if ((cycle + 1) % 5 === 0) console.log(`Measured ${cycle + 1}/20 dashboard reads`);
  }
  const { session: measured } = await api(`/api/resource-sessions/${session.id}/end`, { method: "POST" });
  report.processSamples = { start: measured.startSnapshot, end: measured.endSnapshot };
  report.processMeasurementNote = "Existing application snapshots at workload boundaries, not continuous sampling or peak memory; excludes browser and ngrok.";
  const backup = await api("/api/workspace/backup", { method: "POST", label: "backup-1000" });
  report.backupBytes = Buffer.byteLength(JSON.stringify(backup));
  const backupJson = JSON.stringify(backup);
  check("The recovery fixture exceeds the ordinary 1 MiB request limit", () => assert.ok(Buffer.byteLength(JSON.stringify({ backupJson })) > 1024 * 1024));
  const beforePreview = digest(fs.readFileSync(ledgerFile));
  const backupFile = `${ledgerFile}.backup`;
  const beforePreviewBackup = digest(fs.readFileSync(backupFile));
  const preview = await api("/api/workspace/restore/preview", { method: "POST", body: { backupJson }, label: "restore-preview-1000" });
  check("Large exported backup can be previewed", () => assert.equal(preview.valid, true));
  check("Restore preview does not rewrite the encrypted ledger", () => assert.equal(digest(fs.readFileSync(ledgerFile)), beforePreview));
  check("Restore preview preserves the rotating backup", () => assert.equal(digest(fs.readFileSync(backupFile)), beforePreviewBackup));
  const tooLarge = "x".repeat(16 * 1024 * 1024);
  for (const route of ["/api/workspace/restore/preview", "/api/workspace/restore"]) {
    await api(route, { method: "POST", body: { backupJson: tooLarge, confirm: true }, expectedStatus: 413 });
  }
  await api("/api/projects", { method: "POST", body: { title: "x".repeat(1024 * 1024) }, expectedStatus: 413 });
  check("Oversized requests do not modify the workspace", () => assert.equal(digest(fs.readFileSync(ledgerFile)), beforePreview));
  await api("/api/workspace/reset", { method: "POST", body: { scope: "workspace", confirm: true } });
  await api("/api/workspace/restore", { method: "POST", body: { backupJson, confirm: true }, label: "restore-1000" });
  const restoredProfiles = (await api(campaignRoute)).mentors;
  check("Large backup restores every profile and field", () => assert.equal(digest(restoredProfiles), expectedProfiles));
  await stop();
  await assert.rejects(fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1000) }));
  await start();
  const afterCrash = await api(campaignRoute, { label: "first-read-after-kill" });
  check("Acknowledged data survives process termination and restart", () => assert.equal(digest(afterCrash.mentors), expectedProfiles));
  // Two recorded writes ensure the rotating backup contains the full restored dataset.
  await api("/api/workspace/backup", { method: "POST" });
  await api("/api/workspace/backup", { method: "POST" });
  await stop();
  check("Local ledger is encrypted", () => assert.ok(!fs.readFileSync(ledgerFile, "utf8").includes("Synthetic Mentor")));
  fs.writeFileSync(ledgerFile, "{interrupted-write-test", "utf8");
  await start();
  const recovered = await api(campaignRoute, { label: "read-after-corrupt-primary" });
  check("Corrupt primary recovers full profiles from rotating backup", () => assert.equal(digest(recovered.mentors), expectedProfiles));
  const integrity = await api("/api/workspace/integrity");
  check("Recovered ledger preserves referential integrity", () => assert.equal(integrity.valid, true));
  const recoveryBackup = await api("/api/workspace/backup", { method: "POST" });
  check("Automatic recovery is recorded in the audit trail", () => assert.ok(recoveryBackup.ledger.auditEvents.some((event) => event.action === "recovered_ledger_from_backup")));
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = String(error.stack || error);
  console.error(report.error);
  process.exitCode = 1;
} finally {
  try {
    await stop();
    assert.equal(path.dirname(fs.realpathSync(sandbox)), fs.realpathSync(artifacts));
    assert.ok(path.basename(sandbox).startsWith("operational-"));
    fs.rmSync(sandbox, { recursive: true, force: true });
    report.cleanedUp = true;
  } catch (error) {
    report.cleanedUp = false;
    report.cleanupError = String(error);
    report.status = "failed";
    process.exitCode = 1;
  }
  report.finishedAt = new Date().toISOString();
  const reportFile = path.join(artifacts, "operational-check.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Operational check ${report.status}: ${reportFile}`);
}
