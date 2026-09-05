import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const artifacts = path.join(root, "artifacts");
fs.mkdirSync(artifacts, { recursive: true });
const sandbox = fs.mkdtempSync(path.join(artifacts, "storage-failure-"));
const dataDir = path.join(sandbox, "data");
const ledger = path.join(dataDir, "maro-ledger.json");
const passphrase = randomUUID();
let server;
let closed;
let baseUrl;
let output = "";

function childMessage(type, id) {
  const child = server;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("close", onClose);
      child.off("error", onError);
    };
    const onMessage = (message) => {
      if (message?.type === type && (id === undefined || message.id === id)) { cleanup(); resolve(message); }
    };
    const onClose = () => { cleanup(); reject(new Error(`Child exited while waiting for ${type}: ${output}`)); };
    const onError = (error) => { cleanup(); reject(error); };
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for ${type}: ${output}`)); }, 10000);
    child.on("message", onMessage);
    child.once("close", onClose);
    child.once("error", onError);
  });
}

async function start() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(MARO_|NGROK_|NODE_OPTIONS$)/i.test(key)));
  server = spawn(process.execPath, ["--require", "./scripts/test-helpers/storage-faults.cjs", "dist/index.cjs"], {
    cwd: root,
    env: { ...env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: "0", MARO_DATA_DIR: dataDir, MARO_LEDGER_PASSPHRASE: passphrase },
    stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true,
  });
  closed = new Promise((resolve) => server.once("close", resolve));
  server.on("error", (error) => { output = (output + String(error)).slice(-12000); });
  for (const stream of [server.stdout, server.stderr]) stream.on("data", (chunk) => { output = (output + chunk).slice(-12000); });
  const { address } = await childMessage("storage-test-listening");
  assert.equal(address?.address, "127.0.0.1");
  assert.ok(Number.isInteger(address.port) && address.port > 0 && address.port <= 65535);
  baseUrl = `http://127.0.0.1:${address.port}`;
  assert.equal((await api("/api/health")).persistence, "encrypted-json");
}
async function stop() {
  if (!server) return;
  if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
  await Promise.race([closed, delay(10000, undefined, { ref: false }).then(() => { throw new Error("Storage test child did not stop"); })]);
}
async function api(route, method = "GET", body, status = 200) {
  const response = await fetch(baseUrl + route, {
    method, headers: { "Content-Type": "application/json", "X-MARO-Request": "1" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  assert.equal(response.status, status, JSON.stringify(result));
  return result;
}
async function arm(stage, target, code) {
  const id = randomUUID();
  const acknowledged = childMessage("storage-fault-armed", id);
  const sent = new Promise((resolve, reject) => server.send({ type: "arm-storage-fault", id, stage, target, code }, (error) => error ? reject(error) : resolve()));
  await Promise.all([acknowledged, sent]);
  return id;
}

try {
  await start();
  await api("/api/projects", "POST", { title: "Acknowledged before storage failure" });
  let cases = 0;
  for (const target of ["backup", "primary"]) {
    for (const [stage, code] of [["write", "ENOSPC"], ["sync", "EIO"], ["close", "EIO"], ["rename", "EACCES"], ["open", "EACCES"]]) {
      const before = await api("/api/projects");
      const primaryBytes = fs.readFileSync(ledger);
      const backupBytes = fs.readFileSync(`${ledger}.backup`);
      const id = await arm(stage, target, code);
      const title = `Retry ${target} ${stage}`;
      const faultDelivered = childMessage("storage-fault-fired", id);
      const [error] = await Promise.all([api("/api/projects", "POST", { title }, 500), faultDelivered]);
      assert.equal(error.retryable, true);
      assert.deepEqual(fs.readFileSync(ledger), primaryBytes, "A rejected write must preserve the acknowledged primary bytes");
      assert.deepEqual(fs.readFileSync(`${ledger}.backup`), target === "backup" ? backupBytes : primaryBytes, "The recovery copy must remain a complete previous ledger");
      assert.deepEqual(await api("/api/projects"), before, "A rejected mutation must not leak into the in-memory cache");
      assert.deepEqual(fs.readdirSync(dataDir).filter((name) => name.endsWith(".tmp")), [], "Failed writes must not accumulate temporary ledger files");
      await api("/api/projects", "POST", { title });
      const after = await api("/api/projects");
      assert.equal(after.projects.filter((project) => project.title === title).length, 1, "A healthy retry must persist exactly one project");
      assert.equal(after.projects.length, before.projects.length + 1);
      console.log(`PASS ${target} ${stage}: ${code}, intact data/cache, no temporary files, successful retry`);
      cases++;
    }
  }
  const expected = await api("/api/projects");
  await stop();
  await start();
  assert.deepEqual(await api("/api/projects"), expected, "All acknowledged retry data must survive a process restart");
  assert.equal((await api("/api/workspace/integrity")).valid, true);
  console.log(`PASS ${cases} storage fault cases and persisted restart integrity`);
} finally {
  await stop();
  assert.equal(path.dirname(fs.realpathSync(sandbox)), fs.realpathSync(artifacts));
  assert.ok(path.basename(sandbox).startsWith("storage-failure-"));
  fs.rmSync(sandbox, { recursive: true, force: true });
  console.log("Storage fault runtime and disposable workspace cleaned up.");
}
