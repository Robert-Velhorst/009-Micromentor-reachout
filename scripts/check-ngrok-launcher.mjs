import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const artifacts = path.join(root, "artifacts");
const preload = fileURLToPath(new URL("./test-helpers/ngrok-launcher-boundary.cjs", import.meta.url));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function within(promise, ms, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
    ]);
  } finally { clearTimeout(timer); }
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}
async function close(server) {
  server.closeAllConnections();
  if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
async function until(predicate, message, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await sleep(20);
  }
}
function statusForHost(port, host) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port, path: "/api/health", headers: { Host: host } }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode));
      response.once("error", reject);
    });
    request.setTimeout(2000, () => request.destroy(new Error("Host check timed out")));
    request.once("error", reject);
  });
}

let passed = 0;
async function scenario(name, { occupied = false, agentMode = "running", inspectorMode = "valid", stopServer = false, configuredEndpoint = "", stopDuringVersion = false, runtimeInspector = false } = {}) {
  if (process.argv[2] && !name.includes(process.argv[2])) return;
  const directory = fs.mkdtempSync(path.join(artifacts, "ngrok-launcher-test-"));
  const portOwner = http.createServer((_req, res) => res.end("Unrelated service"));
  const port = await listen(portOwner);
  if (!occupied) await close(portOwner);
  let launcher;
  let output = "";
  const children = [];
  const closedPids = new Set();
  let inspectorRequests = 0;
  let suppliedEndpoints = 0;
  let agentConfiguration;
  let runtimePhase = false;
  const inspector = http.createServer((_req, res) => {
    inspectorRequests++;
    if (inspectorMode === "first-503" && inspectorRequests === 1) {
      res.writeHead(503);
      res.write("busy");
      return;
    }
    if (inspectorMode === "stall" || (inspectorMode === "first-stall" && inspectorRequests === 1)) return;
    if (inspectorMode === "body-stall" || runtimePhase) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write('{"endpoints":');
      return;
    }
    if (!agentConfiguration) { res.end('{"endpoints":[]}'); return; }
    const endpoint = structuredClone(agentConfiguration);
    suppliedEndpoints++;
    if (inspectorMode === "foreign") endpoint.name = "unrelated-agent";
    if (inspectorMode === "invalid-url") endpoint.url = "http://unsafe-fixture.example/path";
    if (inspectorMode === "wrong-upstream") endpoint.upstream.url = `http://example.invalid:${port}`;
    if (inspectorMode === "configured-mismatch") endpoint.url = "https://unexpected-fixture.example";
    if (inspectorMode === "invalid-json") { res.end("not JSON"); return; }
    res.end(JSON.stringify({ endpoints: [endpoint] }));
  });
  const inspectorPort = await listen(inspector);
  try {
    launcher = spawn(process.execPath, ["--expose-gc", "--require", preload, "scripts/ngrok.mjs"], {
      cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: {
        ...process.env, NODE_ENV: "production", PORT: String(port),
        MARO_DATA_DIR: directory, MARO_LEDGER_PASSPHRASE: "isolated-ngrok-launcher-test-key",
        NGROK_BASIC_AUTH: "fixture:synthetic-password-only",
        MARO_ALLOW_PUBLIC_TUNNEL: "0", MARO_NGROK_URL: configuredEndpoint, MARO_ALLOWED_HOSTS: "",
        MARO_TEST_AGENT_MODE: agentMode,
        MARO_TEST_FORCE_GC: inspectorMode === "body-stall" || runtimeInspector ? "1" : "0",
        MARO_TEST_INSPECTOR_URL: `http://127.0.0.1:${inspectorPort}`,
      },
    });
    const completion = once(launcher, "close");
    launcher.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/MARO_AGENT_FIXTURE (.+)\n/);
      if (match) agentConfiguration = JSON.parse(match[1]);
    });
    launcher.stderr.on("data", (chunk) => { output += chunk; });
    launcher.on("message", (message) => {
      if (message.type === "launcher-child") children.push(message);
      if (message.type === "launcher-child-closed") closedPids.add(message.pid);
    });
    if (occupied) {
      const [code] = await within(completion, 20_000, "A occupied-port startup did not terminate");
      assert.equal(children.filter((child) => child.kind === "agent").length, 0, "A foreign listener must not allow ngrok to launch");
      assert.notEqual(code, 0, "Failed local startup must fail the launcher");
      assert.equal(inspectorRequests, 0, "Failed local startup must not query an inspector");
      assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), "Unrelated service");
    } else if (stopDuringVersion) {
      await until(() => children.length > 0, "The version probe was not started");
      launcher.send({ type: "launcher-test-stop" });
      const [code] = await within(completion, 3000, "Cancellation did not interrupt the version probe promptly");
      assert.equal(code, 0);
      assert.equal(children.length, 1);
    } else if (agentMode === "version-stall" || agentMode === "exit" || ["stall", "body-stall"].includes(inspectorMode)) {
      if (["stall", "body-stall"].includes(inspectorMode)) {
        await until(() => children.some((child) => child.kind === "agent"), "The local runtime never reached agent startup", 25_000);
      }
      const [code] = await within(completion, 22_000, "Failed ngrok startup exceeded its bounded shutdown window");
      assert.notEqual(code, 0);
      if (agentMode === "version-stall") {
        assert.equal(children.length, 1, "A hung version check must not start MARO or an agent");
        assert.match(output, /version check timed out/i);
      } else if (agentMode !== "exit") {
        assert.doesNotMatch(output, /ngrok tunnel ready:/);
        assert.match(output, /within 15 seconds/i);
      } else {
        assert.ok(children.some((child) => child.kind === "server"));
        assert.ok(children.some((child) => child.kind === "agent"));
        assert.ok(agentConfiguration, "The ngrok fixture never validated its startup arguments and policy");
        assert.match(output, /ngrok exited \(7\)/);
      }
    } else if (["foreign", "invalid-url", "wrong-upstream", "invalid-json", "configured-mismatch"].includes(inspectorMode)) {
      await until(() => suppliedEndpoints >= 2 || output.includes("ngrok tunnel ready:"), "Inspector matching was not exercised");
      assert.doesNotMatch(output, /ngrok tunnel ready:/, "An unrelated or invalid endpoint was accepted");
      const serverChild = children.find((child) => child.kind === "server");
      assert.deepEqual(JSON.parse(fs.readFileSync(serverChild.allowedHostsPath, "utf8")).hosts, [], "Unverified endpoints must not enter the launcher allowlist");
      assert.equal(await statusForHost(port, new URL(configuredEndpoint || "https://owned-fixture.example").hostname), 421, "The runtime accepted an unverified endpoint Host");
      launcher.send({ type: "launcher-test-stop" });
      const [code] = await within(completion, 8000, "Stopping during discovery did not close the launcher");
      assert.equal(code, 0);
    } else {
      await until(() => output.includes("ngrok tunnel ready:"), "Valid startup never became ready");
      const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
      assert.equal(health.storage.encrypted, true, "Readiness must belong to the real encrypted MARO runtime");
      const serverChild = children.find((child) => child.kind === "server");
      assert.ok(agentConfiguration, "Successful startup did not validate its ngrok arguments and policy");
      assert.deepEqual(JSON.parse(fs.readFileSync(serverChild.allowedHostsPath, "utf8")).hosts, [new URL(configuredEndpoint || "https://owned-fixture.example").hostname]);
      if (runtimeInspector) {
        runtimePhase = true;
        const status = await within(fetch(`http://127.0.0.1:${port}/api/runtime/status`).then((response) => response.json()), 7000, "Runtime status hung on a partial inspector response after GC");
        assert.equal(status.tunnel.active, false);
        assert.ok(inspectorRequests >= 12, "Runtime status did not check the available inspector range");
      }
      if (inspectorMode === "first-stall") assert.ok(inspectorRequests >= 2, "A stalled inspector prevented fallback");
      if (stopServer) process.kill(serverChild.pid, "SIGKILL");
      else launcher.send({ type: "launcher-test-stop" });
      const [code] = await within(completion, 8000, "Ready launcher did not clean up on shutdown");
      assert.equal(code, stopServer ? 1 : 0);
    }
    assert.doesNotMatch(output, /synthetic-password-only/, "The policy secret must not be printed");
    for (const child of children) {
      assert.ok(closedPids.has(child.pid), `Owned ${child.kind} child was not closed before launcher exit`);
      for (const file of [child.allowedHostsPath, child.policyPath].filter(Boolean)) {
        assert.equal(fs.existsSync(file), false, "Launcher left an owned temporary policy/hosts file");
      }
    }
    console.log(`PASS ngrok launcher: ${name}`);
    passed++;
  } catch (error) {
    console.error(JSON.stringify({
      scenario: name, launcherOutput: output, inspectorRequests,
      children: children.map(({ kind, pid }) => ({ kind, pid, closed: closedPids.has(pid) })),
    }));
    throw error;
  } finally {
    // Clean up only PIDs recorded from this test's spawn boundary, never by name.
    for (const child of children) {
      if (!closedPids.has(child.pid) && child.pid) {
        try { process.kill(child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      }
    }
    if (launcher && launcher.exitCode === null && launcher.signalCode === null) {
      launcher.kill("SIGKILL");
      await once(launcher, "close");
    }
    await close(inspector);
    await close(portOwner);
    for (const child of children) {
      for (const file of [child.allowedHostsPath, child.policyPath].filter(Boolean)) {
        assert.equal(path.dirname(path.resolve(file)).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
        assert.match(path.basename(file), new RegExp(`^maro-(allowed-hosts|ngrok-policy)-${launcher.pid}-`));
        fs.rmSync(file, { force: true });
      }
    }
    const resolved = fs.realpathSync(directory);
    assert.equal(path.dirname(resolved).toLowerCase(), fs.realpathSync(artifacts).toLowerCase());
    assert.ok(path.basename(resolved).startsWith("ngrok-launcher-test-"));
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

await scenario("an occupied port never starts a public-tunnel process", { occupied: true });
await scenario("confirmed startup publishes only its own HTTPS host and cleans up on stop");
await scenario("an exited ngrok process stops the owned local runtime", { agentMode: "exit" });
await scenario("an exited local runtime stops the owned ngrok process", { stopServer: true });
await scenario("a hung ngrok version check is terminated before MARO starts", { agentMode: "version-stall" });
await scenario("cancellation interrupts a running version probe", { agentMode: "version-stall", stopDuringVersion: true });
await scenario("an unresponsive inspector cannot exceed the discovery deadline", { inspectorMode: "stall" });
await scenario("partial inspector JSON cannot bypass the discovery deadline", { inspectorMode: "body-stall" });
await scenario("a stalled inspector does not block the next inspector", { inspectorMode: "first-stall" });
await scenario("an HTTP error body is closed before trying the next inspector", { inspectorMode: "first-503" });
await scenario("another agent with the same upstream is not accepted", { inspectorMode: "foreign" });
await scenario("a non-HTTPS or path-bearing endpoint is not accepted", { inspectorMode: "invalid-url" });
await scenario("a different upstream is not accepted", { inspectorMode: "wrong-upstream" });
await scenario("invalid inspector JSON can be interrupted cleanly", { inspectorMode: "invalid-json" });
await scenario("a dedicated endpoint must match the configured origin", { configuredEndpoint: "https://configured-fixture.example", inspectorMode: "configured-mismatch" });
await scenario("a matching dedicated endpoint becomes available", { configuredEndpoint: "https://configured-fixture.example" });
await scenario("runtime status releases partial inspector bodies even after GC", { runtimeInspector: true });
assert.ok(passed > 0, "No launcher scenarios matched the requested filter");
console.log(`PASS ngrok launcher suite: ${passed} isolated process scenarios; no real ngrok or public endpoints`);
