import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath || "";
const npmRunner = npmExecPath
  ? { command: process.execPath, argsPrefix: [npmExecPath] }
  : { command: npmCommand, argsPrefix: [] };

function run(label, command, args, options = {}) {
  console.log(`\n[release-check] ${label}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: options.env || process.env,
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} failed with exit code ${code}`));
      }
    });
  });
}

function runNpm(label, args) {
  return run(label, npmRunner.command, [...npmRunner.argsPrefix, ...args]);
}

function assertSourceIncludes(source, expected, message) {
  if (!source.includes(expected)) throw new Error(message);
}

function assertSourceExcludes(source, unexpected, message) {
  if (source.includes(unexpected)) throw new Error(message);
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForJson(url, predicate, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const value = await response.json();
        if (predicate(value)) return value;
      }
    } catch {
      // The installed server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function terminateProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === "win32") {
    await run("Stop Windows installed runtime", "taskkill.exe", ["/PID", String(pid), "/T", "/F"]);
    await new Promise((resolve) => setTimeout(resolve, 250));
    return;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if (error?.code === "ESRCH") return;
    throw error;
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error?.code === "ESRCH") return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Process ${pid} did not stop`);
}

console.log("\n[release-check] Secure ngrok policy");
const tunnelLauncherSource = fs.readFileSync(path.join(process.cwd(), "scripts", "ngrok.mjs"), "utf8");
const installerSource = fs.readFileSync(path.join(process.cwd(), "scripts", "build-windows-installer.mjs"), "utf8");
const serverSource = fs.readFileSync(path.join(process.cwd(), "server", "index.ts"), "utf8");
const ledgerSource = fs.readFileSync(path.join(process.cwd(), "server", "ledger.ts"), "utf8");
const ledgerClientSource = fs.readFileSync(path.join(process.cwd(), "client", "src", "lib", "ledgerApi.ts"), "utf8");
const dockerSource = fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf8");
const composeSource = fs.readFileSync(path.join(process.cwd(), "docker-compose.yml"), "utf8");
const requiredDocs = [
  "TECHNICAL_AUDIT.md", "CRITICAL_PATH.md", "ACCEPTANCE_TESTS.md", "GOAL_COMPLETION_MATRIX.md",
  "FINAL_VERIFICATION_REPORT.md", "UI_ACTION_AUDIT.md", "API_USAGE_AUDIT.md", "SECURITY.md",
  "OPERATOR_RUNBOOK.md", "CODEX_WORKLOG.md", "CODEX_CHECKPOINTS.md", "TASK_GRAPH.md",
];
assertSourceIncludes(
  tunnelLauncherSource,
  "if (!basicAuth && !allowPublicTunnel)",
  "ngrok launcher no longer blocks unauthenticated public tunnels by default"
);
assertSourceIncludes(
  tunnelLauncherSource,
  'process.env.MARO_ALLOW_PUBLIC_TUNNEL === "1"',
  "ngrok launcher no longer requires an explicit public-tunnel opt-in"
);
assertSourceIncludes(tunnelLauncherSource, "--traffic-policy-file", "ngrok launcher no longer uses Traffic Policy Basic Auth");
assertSourceIncludes(tunnelLauncherSource, "inspectorPort <= 4050", "ngrok launcher no longer discovers alternate inspector ports");
assertSourceIncludes(tunnelLauncherSource, "MARO_NGROK_URL", "ngrok launcher no longer supports a dedicated endpoint");
assertSourceIncludes(tunnelLauncherSource, "/api/endpoints", "ngrok launcher no longer uses the current Agent API endpoint");
assertSourceExcludes(tunnelLauncherSource, '"--basic-auth"', "ngrok launcher uses the deprecated Basic Auth command-line flag");
assertSourceExcludes(tunnelLauncherSource, "/api/tunnels", "ngrok launcher uses the deprecated tunnel-list endpoint");
assertSourceIncludes(
  installerSource,
  '$env:MARO_ALLOW_PUBLIC_TUNNEL -eq "1"',
  "Windows launcher no longer requires an explicit public-tunnel opt-in"
);
assertSourceIncludes(
  installerSource,
  "The public tunnel remains off.",
  "Windows launcher no longer reports that an unprotected tunnel was blocked"
);
assertSourceIncludes(installerSource, "ProtectedData.Protect", "Windows installer no longer creates a DPAPI-protected ledger key");
assertSourceIncludes(installerSource, "MigrateLegacyData", "Windows installer no longer migrates legacy workspace data");
assertSourceIncludes(installerSource, "InstallPayloadAtomically", "Windows installer no longer replaces application files atomically");
assertSourceIncludes(installerSource, '"--traffic-policy-file"', "Windows launcher no longer uses Traffic Policy Basic Auth");
assertSourceIncludes(installerSource, "MARO_NGROK_URL", "Windows launcher no longer supports a dedicated endpoint");
assertSourceIncludes(installerSource, "/api/endpoints", "Windows launcher no longer uses the current Agent API endpoint");
assertSourceExcludes(installerSource, '"--basic-auth=', "Windows launcher exposes Basic Auth through the deprecated command-line flag");
assertSourceExcludes(installerSource, "/api/tunnels", "Windows launcher uses the deprecated tunnel-list endpoint");
assertSourceIncludes(serverSource, "/api/endpoints", "Runtime status no longer uses the current ngrok Agent API endpoint");
assertSourceExcludes(serverSource, "/api/tunnels", "Runtime status uses the deprecated ngrok tunnel-list endpoint");
assertSourceIncludes(
  serverSource,
  'req.get("X-MARO-Request") !== "1"',
  "API mutations no longer require the same-app request marker"
);
assertSourceIncludes(
  serverSource,
  'req.get("Sec-Fetch-Site") === "cross-site"',
  "API mutations no longer reject cross-site browser requests"
);
assertSourceIncludes(
  serverSource,
  "hostIsAllowed(req)",
  "Server requests are no longer protected by the Host allowlist"
);
assertSourceIncludes(
  serverSource,
  'hostname.startsWith("[")',
  "IPv6 localhost Host values are no longer normalized"
);
assertSourceIncludes(
  ledgerClientSource,
  'headers.set("X-MARO-Request", "1")',
  "Production API client no longer supplies the same-app mutation marker"
);
assertSourceIncludes(
  ledgerSource,
  'app.get("/api/dashboard"',
  "The aggregate dashboard endpoint is missing"
);
assertSourceIncludes(
  ledgerSource,
  'app.post("/api/workspace/backup"',
  "Audited workspace backup export is no longer mutation-guarded"
);
assertSourceIncludes(
  ledgerSource,
  "atomicWriteFile",
  "Ledger persistence no longer uses atomic file replacement"
);
assertSourceIncludes(
  ledgerSource,
  "workspaceIntegrityError",
  "Workspace restore no longer validates ledger references"
);
assertSourceIncludes(dockerSource, 'CMD ["node", "dist/index.cjs"]', "Docker runtime no longer starts the Express application");
assertSourceIncludes(dockerSource, "USER maro", "Docker runtime no longer drops root privileges");
assertSourceIncludes(dockerSource, "/api/readiness", "Docker healthcheck no longer uses readiness");
assertSourceIncludes(composeSource, "MARO_LEDGER_PASSPHRASE:?", "Docker Compose no longer requires encrypted production persistence");
for (const filename of requiredDocs) {
  if (!fs.existsSync(path.join(process.cwd(), "docs", filename))) throw new Error(`Required release document is missing: ${filename}`);
}

await runNpm("Doctor preflight", ["run", "doctor"]);
await runNpm("Dependency security audit", ["run", "audit:security"]);
await runNpm("TypeScript contract check", ["run", "check"]);
await runNpm("Build plus encrypted ledger API smoke test", ["run", "check:api"]);

if (process.platform === "win32") {
  await run("Windows installer build", process.execPath, ["scripts/build-windows-installer.mjs"]);
  const installerPath = path.join(process.cwd(), "artifacts", "MARO-Windows11-Setup.exe");
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "maro-installer-smoke-"));
  const installRoot = path.join(testRoot, "app");
  const dataRoot = path.join(testRoot, "workspace-data");
  const legacyLedger = JSON.stringify({ schemaVersion: 1, migratedByReleaseSmoke: true });
  fs.mkdirSync(path.join(installRoot, "data"), { recursive: true });
  fs.writeFileSync(path.join(installRoot, "data", "maro-ledger.json"), legacyLedger, "utf8");
  const installerEnvironment = {
    ...process.env,
    MARO_INSTALL_DIR: installRoot,
    MARO_USER_DATA_DIR: dataRoot,
    MARO_SKIP_SHORTCUTS: "1",
    MARO_SKIP_REGISTRY: "1",
    MARO_SKIP_LAUNCH: "1",
  };
  let installedServerPid = 0;
  try {
    await run("Windows installer isolated install", installerPath, [], {
      env: installerEnvironment,
    });

    const requiredFiles = [
      "MARO.cmd",
      "MARO.ps1",
      "Stop-MARO.ps1",
      "MARO.data-path.txt",
      "Uninstall-MARO.cmd",
      "MARO.install.json",
      path.join("runtime", "node.exe"),
      path.join("dist", "index.cjs"),
      path.join("dist", "public", "index.html"),
      path.join("dist", "public", "maro-manual-handoff-extension.zip"),
    ];
    for (const relativePath of requiredFiles) {
      if (!fs.existsSync(path.join(installRoot, relativePath))) {
        throw new Error(`Installed payload is missing ${relativePath}`);
      }
    }

    const installedDataPath = fs.readFileSync(path.join(installRoot, "MARO.data-path.txt"), "utf8").trim();
    if (path.resolve(installedDataPath) !== path.resolve(dataRoot)) {
      throw new Error("Installed launcher does not point at the isolated workspace data directory");
    }
    const migratedLedgerPath = path.join(dataRoot, "maro-ledger.json");
    if (fs.readFileSync(migratedLedgerPath, "utf8") !== legacyLedger) {
      throw new Error("Installer did not preserve and migrate the legacy workspace ledger exactly");
    }
    const protectedKeyPath = path.join(dataRoot, "ledger-key.dpapi");
    const protectedKey = fs.readFileSync(protectedKeyPath);
    if (protectedKey.length < 32 || protectedKey.includes(Buffer.from("MARO ledger key v1"))) {
      throw new Error("Installed ledger key is missing or is not protected at rest");
    }

    const installedPort = await availablePort();
    await run(
      "Windows installed runtime launch",
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(installRoot, "MARO.ps1")],
      {
        env: {
          ...process.env,
          PORT: String(installedPort),
          MARO_SKIP_BROWSER: "1",
          MARO_SKIP_NGROK: "1",
        },
      }
    );
    const health = await waitForJson(
      `http://127.0.0.1:${installedPort}/api/health`,
      (value) => value?.ok === true
    );
    const readinessResponse = await fetch(`http://127.0.0.1:${installedPort}/api/readiness`);
    const readiness = await readinessResponse.json();
    if (!readiness.checks?.ledgerReadable || health.persistence !== "encrypted-json" || !health.storage?.encrypted) {
      throw new Error("Installed Windows runtime did not start with readable encrypted persistence");
    }

    installedServerPid = Number(fs.readFileSync(path.join(dataRoot, "MARO.server.pid"), "utf8").trim());
    if (!Number.isInteger(installedServerPid) || installedServerPid <= 0) {
      throw new Error("Installed launcher did not record its server process ID");
    }
    await run(
      "Windows installed runtime stop",
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(installRoot, "Stop-MARO.ps1")]
    );
    let stopped = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await fetch(`http://127.0.0.1:${installedPort}/api/health`);
      } catch {
        stopped = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!stopped) throw new Error("Installed stop helper did not terminate the owned MARO server");
    installedServerPid = 0;

    const encryptedLedgerHash = createHash("sha256").update(fs.readFileSync(migratedLedgerPath)).digest("hex");
    const protectedKeyHash = createHash("sha256").update(fs.readFileSync(protectedKeyPath)).digest("hex");
    await run("Windows installer upgrade preservation", installerPath, [], { env: installerEnvironment });
    if (createHash("sha256").update(fs.readFileSync(migratedLedgerPath)).digest("hex") !== encryptedLedgerHash) {
      throw new Error("Installer upgrade changed or erased the encrypted workspace ledger");
    }
    if (createHash("sha256").update(fs.readFileSync(protectedKeyPath)).digest("hex") !== protectedKeyHash) {
      throw new Error("Installer upgrade replaced the existing DPAPI ledger key");
    }

    const installerBytes = fs.readFileSync(installerPath);
    const installerHash = createHash("sha256").update(installerBytes).digest("hex").toUpperCase();
    console.log(`[release-check] Installer SHA-256: ${installerHash}`);
  } finally {
    if (installedServerPid > 0) {
      try { await terminateProcess(installedServerPid); } catch {}
    }
    try {
      fs.rmSync(testRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      console.warn(`[release-check] Temporary installer directory cleanup deferred: ${error.message}`);
    }
  }
} else {
  console.log("\n[release-check] Windows installer build skipped because this host is not Windows.");
}

console.log("\n[release-check] Release gate passed.");
