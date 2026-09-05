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

    child.once("error", reject);
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

async function installedApi(port, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "X-MARO-Request": "1" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    throw new Error(`Installed API ${pathname} returned ${response.status}: ${failure.error || "unknown error"}`);
  }
  return response.json();
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

async function waitForProcessExit(pid, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error?.code === "ESRCH") return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Process ${pid} remained alive after the installed stop helper returned`);
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
assertSourceIncludes(tunnelLauncherSource, "MARO_ALLOWED_HOSTS_FILE", "ngrok launcher no longer publishes its exact dynamic Host allowlist");
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
assertSourceIncludes(installerSource, "MoveDirectoryWithRetry", "Windows installer no longer tolerates transient application-directory locks");
assertSourceIncludes(installerSource, "StopExistingRuntime", "Windows installer no longer stops a running owned runtime before upgrade");
assertSourceIncludes(installerSource, "Get-Process -Id $ownedProcessId", "Windows stop helper no longer waits for the owned process to exit");
assertSourceIncludes(installerSource, "$desiredRuntimeConfig", "Windows launcher no longer restarts after security-relevant runtime configuration changes");
assertSourceIncludes(installerSource, "MARO.allowed-hosts.json", "Windows launcher no longer publishes its exact dynamic Host allowlist");
assertSourceIncludes(installerSource, '"--traffic-policy-file"', "Windows launcher no longer uses Traffic Policy Basic Auth");
assertSourceIncludes(installerSource, "MARO_NGROK_URL", "Windows launcher no longer supports a dedicated endpoint");
assertSourceIncludes(installerSource, "/api/endpoints", "Windows launcher no longer uses the current Agent API endpoint");
assertSourceExcludes(installerSource, '"--basic-auth=', "Windows launcher exposes Basic Auth through the deprecated command-line flag");
assertSourceExcludes(installerSource, "/api/tunnels", "Windows launcher uses the deprecated tunnel-list endpoint");
assertSourceIncludes(serverSource, "/api/endpoints", "Runtime status no longer uses the current ngrok Agent API endpoint");
assertSourceExcludes(serverSource, "/api/tunnels", "Runtime status uses the deprecated ngrok tunnel-list endpoint");
assertSourceIncludes(serverSource, "MARO_ALLOWED_HOSTS_FILE", "Server no longer loads the launcher-managed exact Host allowlist");
assertSourceExcludes(serverSource, "ngrokHostSuffixes", "Server still broadly trusts every ngrok hostname while tunnel mode is enabled");
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
await runNpm("Manual handoff extension checks", ["run", "check:extension"]);
await runNpm("Recommendation equivalence and complexity checks", ["run", "check:recommendations"]);
await runNpm("Mentor pagination boundary checks", ["run", "check:mentor-pagination"]);
await runNpm("Build plus encrypted ledger API smoke test", ["run", "check:api"]);
await run("Storage failure and retry checks", process.execPath, ["scripts/check-storage-failures.mjs"]);
await run("Large workspace and recovery checks", process.execPath, ["scripts/check-operational.mjs"]);

if (process.platform === "win32") {
  await run("Windows installer build", process.execPath, ["scripts/build-windows-installer.mjs"]);
  const installerPath = path.join(process.cwd(), "artifacts", "MARO-Windows11-Setup.exe");
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "maro-installer-smoke-"));
  const installRoot = path.join(testRoot, "app");
  const dataRoot = path.join(testRoot, "workspace-data");
  const legacyLedger = JSON.stringify({
    schemaVersion: 1,
    migratedByReleaseSmoke: true,
    operators: [{ id: "local-operator", name: "Installer test operator", createdAt: "2026-01-01T00:00:00.000Z" }],
  });
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
  // Installed launch must not depend on Node/npm or other development tools on PATH.
  const windowsRoot = process.env.SystemRoot || "C:\\Windows";
  const installedEnvironment = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "PATH")),
    PATH: [windowsRoot, path.join(windowsRoot, "System32"), path.join(windowsRoot, "System32", "WindowsPowerShell", "v1.0")].join(path.delimiter),
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
    const installedManifest = JSON.parse(fs.readFileSync(path.join(installRoot, "MARO.install.json"), "utf8"));
    const releaseNodeVersion = fs.readFileSync(path.join(process.cwd(), ".node-version"), "utf8").trim();
    if (installedManifest.nodeVersion !== releaseNodeVersion || installedManifest.architecture !== "x64") {
      throw new Error("Installer manifest does not identify the pinned x64 runtime");
    }
    await run("Installed bundled runtime executable", path.join(installRoot, "runtime", "node.exe"), [
      "-e", `if(process.versions.node !== ${JSON.stringify(releaseNodeVersion)}) process.exit(1); console.log(process.version);`,
    ], { env: installedEnvironment });

    const installedDataPath = fs.readFileSync(path.join(installRoot, "MARO.data-path.txt"), "utf8").trim();
    if (fs.realpathSync.native(installedDataPath) !== fs.realpathSync.native(dataRoot)) {
      throw new Error(`Installed launcher data directory differs: ${installedDataPath} versus ${dataRoot}`);
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
          ...installedEnvironment,
          PORT: String(installedPort),
          MARO_SKIP_BROWSER: "1",
          MARO_SKIP_NGROK: "1",
        },
      }
    );
    installedServerPid = Number(fs.readFileSync(path.join(dataRoot, "MARO.server.pid"), "utf8").trim());
    const health = await waitForJson(
      `http://127.0.0.1:${installedPort}/api/health`,
      (value) => value?.ok === true
    );
    const readinessResponse = await fetch(`http://127.0.0.1:${installedPort}/api/readiness`);
    const readiness = await readinessResponse.json();
    if (!readiness.checks?.ledgerReadable || health.persistence !== "encrypted-json" || !health.storage?.encrypted) {
      throw new Error("Installed Windows runtime did not start with readable encrypted persistence");
    }
    const recoveryProject = await installedApi(installedPort, "/api/projects", {
      title: "Portable recovery test", description: "Disposable installer acceptance data",
    });
    const recoveryCampaign = await installedApi(installedPort, "/api/campaigns", {
      projectId: recoveryProject.project.id, title: "Recovery acceptance campaign",
      goal: "Verify portable backup across fresh installation keys.",
    });
    const portableBackup = await installedApi(installedPort, "/api/workspace/backup", {});

    installedServerPid = Number(fs.readFileSync(path.join(dataRoot, "MARO.server.pid"), "utf8").trim());
    if (!Number.isInteger(installedServerPid) || installedServerPid <= 0) {
      throw new Error("Installed launcher did not record its server process ID");
    }
    const originalServerPid = installedServerPid;
    await run(
      "Windows installed runtime configuration restart",
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(installRoot, "MARO.ps1")],
      {
        env: {
          ...installedEnvironment,
          PORT: String(installedPort),
          MARO_SKIP_BROWSER: "1",
          MARO_SKIP_NGROK: "1",
          MARO_HAI_FEED_ENABLED: "1",
        },
      }
    );
    const haiManifest = await waitForJson(
      `http://127.0.0.1:${installedPort}/api/integrations/hai/manifest`,
      (value) => value?.enabled === true && value?.readOnly === true
    );
    installedServerPid = Number(fs.readFileSync(path.join(dataRoot, "MARO.server.pid"), "utf8").trim());
    if (installedServerPid === originalServerPid || haiManifest.schema !== "hai.generic_json_feed.v1") {
      throw new Error("Installed launcher did not restart with the changed HAI runtime configuration");
    }
    await waitForProcessExit(originalServerPid);

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
    await waitForProcessExit(installedServerPid);
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

    await run(
      "Windows installed runtime relaunch before in-use upgrade",
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(installRoot, "MARO.ps1")],
      {
        env: {
          ...installedEnvironment,
          PORT: String(installedPort),
          MARO_SKIP_BROWSER: "1",
          MARO_SKIP_NGROK: "1",
          MARO_HAI_FEED_ENABLED: "1",
        },
      }
    );
    await waitForJson(`http://127.0.0.1:${installedPort}/api/health`, (value) => value?.ok === true);
    installedServerPid = Number(fs.readFileSync(path.join(dataRoot, "MARO.server.pid"), "utf8").trim());
    const runningUpgradePid = installedServerPid;
    await run("Windows installer in-use upgrade", installerPath, [], { env: installerEnvironment });
    await waitForProcessExit(runningUpgradePid);
    installedServerPid = 0;
    try {
      await fetch(`http://127.0.0.1:${installedPort}/api/health`);
      throw new Error("Installer returned while the previous installed runtime was still reachable");
    } catch (error) {
      if (error?.message === "Installer returned while the previous installed runtime was still reachable") throw error;
    }
    if (createHash("sha256").update(fs.readFileSync(migratedLedgerPath)).digest("hex") !== encryptedLedgerHash) {
      throw new Error("In-use installer upgrade changed or erased the encrypted workspace ledger");
    }
    if (createHash("sha256").update(fs.readFileSync(protectedKeyPath)).digest("hex") !== protectedKeyHash) {
      throw new Error("In-use installer upgrade replaced the existing DPAPI ledger key");
    }

    const recoveryInstallRoot = path.join(testRoot, "recovery-app");
    const recoveryDataRoot = path.join(testRoot, "recovery-data");
    await run("Windows fresh installation for portable recovery", installerPath, [], {
      env: { ...installerEnvironment, MARO_INSTALL_DIR: recoveryInstallRoot, MARO_USER_DATA_DIR: recoveryDataRoot },
    });
    const newKeyHash = createHash("sha256").update(fs.readFileSync(path.join(recoveryDataRoot, "ledger-key.dpapi"))).digest("hex");
    if (newKeyHash === protectedKeyHash) throw new Error("Recovery installation did not generate an independent key");
    const recoveryPort = await availablePort();
    await run("Windows fresh recovery runtime launch", "powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(recoveryInstallRoot, "MARO.ps1"),
    ], { env: { ...installedEnvironment, PORT: String(recoveryPort), MARO_SKIP_BROWSER: "1", MARO_SKIP_NGROK: "1" } });
    installedServerPid = Number(fs.readFileSync(path.join(recoveryDataRoot, "MARO.server.pid"), "utf8").trim());
    await waitForJson(`http://127.0.0.1:${recoveryPort}/api/health`, (value) => value?.storage?.encrypted === true);
    const preview = await installedApi(recoveryPort, "/api/workspace/restore/preview", { backupJson: JSON.stringify(portableBackup) });
    if (!preview.valid) throw new Error("Fresh installation rejected a valid portable backup");
    await installedApi(recoveryPort, "/api/workspace/restore", { backupJson: JSON.stringify(portableBackup), confirm: true });
    const restoredCampaign = await installedApi(recoveryPort, `/api/campaigns/${recoveryCampaign.campaign.id}`);
    if (restoredCampaign.campaign.title !== recoveryCampaign.campaign.title || restoredCampaign.campaign.projectId !== recoveryProject.project.id) {
      throw new Error("Fresh installation did not restore campaign data and project relationship");
    }
    await run("Windows recovered runtime stop", "powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(recoveryInstallRoot, "Stop-MARO.ps1"),
    ]);
    await waitForProcessExit(installedServerPid);
    installedServerPid = 0;
    await run("Windows recovered runtime restart", "powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(recoveryInstallRoot, "MARO.ps1"),
    ], { env: { ...installedEnvironment, PORT: String(recoveryPort), MARO_SKIP_BROWSER: "1", MARO_SKIP_NGROK: "1" } });
    installedServerPid = Number(fs.readFileSync(path.join(recoveryDataRoot, "MARO.server.pid"), "utf8").trim());
    await waitForJson(`http://127.0.0.1:${recoveryPort}/api/health`, (value) => value?.storage?.encrypted === true);
    const persistedRecovery = await installedApi(recoveryPort, `/api/campaigns/${recoveryCampaign.campaign.id}`);
    if (persistedRecovery.campaign.title !== recoveryCampaign.campaign.title) {
      throw new Error("Restored data did not survive restart under the new encryption key");
    }
    await run("Windows recovered runtime final stop", "powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(recoveryInstallRoot, "Stop-MARO.ps1"),
    ]);
    await waitForProcessExit(installedServerPid);
    installedServerPid = 0;
    console.log("[release-check] Portable backup restored and restarted with an independent Windows key.");

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
