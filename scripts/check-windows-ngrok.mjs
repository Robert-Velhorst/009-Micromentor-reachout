import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32")
  throw new Error("Windows ngrok checks require Windows PowerShell.");
const launcherPath = fileURLToPath(
  new URL("../artifacts/windows-installer/app/MARO.ps1", import.meta.url)
);
const fixturePath = fileURLToPath(
  new URL("./test-helpers/windows-ngrok-functions.ps1", import.meta.url)
);
const artifacts = fileURLToPath(new URL("../artifacts", import.meta.url));
const directory = fs.mkdtempSync(path.join(artifacts, "windows-ngrok-test-"));
let testCase = "foreign";
let requestCount = 0;
const inspector = http.createServer((request, response) => {
  if (request.url === "/warm-up") { response.end("ready"); return; }
  requestCount++;
  response.setHeader("Content-Type", "application/json");
  const endpoint = {
    name: "maro-0123456789abcdef0123456789abcdef",
    url: "https://owned-fixture.example",
    upstream: { url: "http://127.0.0.1:39871" },
    traffic_policy: "not-for-export",
  };
  if (testCase === "headers" || (testCase === "fallback" && requestCount === 1))
    return;
  if (testCase === "body") {
    response.write('{"endpoints":');
    return;
  }
  if (testCase === "invalid-json") {
    response.end("not-json");
    return;
  }
  if (testCase === "foreign") endpoint.name = "another-application";
  if (testCase === "localhost")
    endpoint.upstream.url = "http://localhost:39871";
  if (testCase === "wrong-port")
    endpoint.upstream.url = "http://127.0.0.1:39872";
  if (testCase === "upstream-scheme")
    endpoint.upstream.url = "https://127.0.0.1:39871";
  if (testCase === "upstream-path") endpoint.upstream.url += "/another-app";
  if (testCase === "public-http") endpoint.url = "http://owned-fixture.example";
  if (testCase === "public-path") endpoint.url += "/unexpected";
  if (testCase === "public-query") endpoint.url += "/?token=unwanted";
  if (testCase === "public-credentials")
    endpoint.url = "https://fixture:password@owned-fixture.example";
  if (testCase === "wrong-origin")
    endpoint.url = "https://another-fixture.example";
  response.end(JSON.stringify({ endpoints: [endpoint] }));
});
inspector.listen(0, "127.0.0.1");
await once(inspector, "listening");
let child;
let ownedFixture;
let ownedFixtureClosed;
let timer;
let passed = 0;
let fingerprint;
const processCases = [
  "ownership",
  "stale-stop",
  "valid-stop",
  "handle-retention",
  "fixture-timeout",
  "config-locked-state",
  "config-locked-host-publication",
  "config-activation",
  "config-locked-policy",
  "config-startup",
];
async function stopOwnedFixture() {
  if (!ownedFixture) return;
  if (ownedFixture.exitCode === null && ownedFixture.signalCode === null)
    ownedFixture.kill();
  await ownedFixtureClosed;
  assert.ok(
    ownedFixture.exitCode !== null || ownedFixture.signalCode !== null,
    "Owned fixture did not close"
  );
  ownedFixture = null;
}
try {
  for (testCase of [
    "foreign",
    "valid",
    "localhost",
    "wrong-port",
    "upstream-scheme",
    "upstream-path",
    "public-http",
    "public-path",
    "public-query",
    "public-credentials",
    "wrong-origin",
    "invalid-json",
    "headers",
    "body",
    "fallback",
    "fingerprint",
    "fingerprint-repeat",
    "ownership",
    "stale-stop",
    "valid-stop",
    "handle-retention",
    "fixture-timeout",
    "config-locked-host",
    "config-locked-state",
    "config-locked-host-publication",
    "config-activation",
    "config-replace",
    "config-exclusive",
    "config-locked-cleanup",
    "config-locked-policy",
    "config-policy-create-failure",
    "config-startup",
  ]) {
    if (process.argv[2] && testCase !== process.argv[2]) continue;
    requestCount = 0;
    if (processCases.includes(testCase)) {
      const idlePath = fileURLToPath(
        new URL("./test-helpers/windows-ngrok-idle.cjs", import.meta.url)
      );
      ownedFixture = spawn(
        process.execPath,
        [
          `"${idlePath}"`,
          '"http://127.0.0.1:39871"',
          '"--name"',
          '"maro-0123456789abcdef0123456789abcdef"',
        ],
        {
          windowsHide: true,
          windowsVerbatimArguments: true,
          stdio: "ignore",
        }
      );
      ownedFixtureClosed = once(ownedFixture, "close");
      await once(ownedFixture, "spawn");
    }
    child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        fixturePath,
        "-LauncherPath",
        launcherPath,
        "-InspectorPort",
        String(inspector.address().port),
        "-FallbackPort",
        testCase === "fallback" ? String(inspector.address().port) : "0",
        "-Case",
        testCase,
        "-NodePath",
        process.execPath,
        "-TestDirectory",
        directory,
        "-OwnedPid",
        String(ownedFixture?.pid || 0),
      ],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    let output = "";
    child.stdout.on("data", chunk => {
      output += chunk;
      if (testCase === "fixture-timeout" && output.includes("TIMEOUT_READY"))
        child.kill();
    });
    child.stderr.on("data", chunk => {
      output += chunk;
    });
    timer = setTimeout(() => child.kill(), 30_000);
    const [code] = await once(child, "close");
    clearTimeout(timer);
    await stopOwnedFixture();
    console.log(output.trim());
    assert.doesNotMatch(output, /synthetic-policy-password|synthetic-sensitive-content/, "Configuration contents escaped into diagnostics");
    if (testCase === "fixture-timeout") {
      assert.match(output, /TIMEOUT_READY/);
      assert.notEqual(
        code,
        0,
        "The fixture must be interrupted before its own cleanup"
      );
      console.log("PASS Windows ngrok: fixture-timeout parent cleanup");
      passed++;
      continue;
    }
    assert.equal(code, 0, "Packaged Windows ngrok function checks failed");
    assert.match(output, /PASS Windows ngrok:/);
    if (testCase.startsWith("fingerprint")) {
      const actual = output.match(/^FINGERPRINT (.+)$/m)?.[1].trim();
      assert.ok(actual, "Missing configuration fingerprint evidence");
      if (fingerprint)
        assert.equal(
          actual,
          fingerprint,
          "Configuration fingerprint changed between PowerShell processes"
        );
      fingerprint = actual;
    } else if (!processCases.includes(testCase) && !testCase.startsWith("config-")) {
      assert.ok(
        requestCount > 0,
        "The packaged function never reached its owned inspector"
      );
    }
    passed++;
  }
  assert.ok(passed > 0, "No Windows ngrok scenarios matched");
  console.log(
    `PASS Windows ngrok suite: ${passed} packaged-function scenarios; no public tunnels`
  );
} finally {
  clearTimeout(timer);
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill();
    await once(child, "close");
  }
  await stopOwnedFixture();
  inspector.closeAllConnections();
  await new Promise(resolve => inspector.close(resolve));
  assert.equal(
    path.dirname(fs.realpathSync(directory)),
    fs.realpathSync(artifacts)
  );
  assert.ok(path.basename(directory).startsWith("windows-ngrok-test-"));
  fs.rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
