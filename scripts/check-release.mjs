import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
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

console.log("\n[release-check] Secure ngrok policy");
const tunnelLauncherSource = fs.readFileSync(path.join(process.cwd(), "scripts", "ngrok.mjs"), "utf8");
const installerSource = fs.readFileSync(path.join(process.cwd(), "scripts", "build-windows-installer.mjs"), "utf8");
const serverSource = fs.readFileSync(path.join(process.cwd(), "server", "index.ts"), "utf8");
const ledgerSource = fs.readFileSync(path.join(process.cwd(), "server", "ledger.ts"), "utf8");
const ledgerClientSource = fs.readFileSync(path.join(process.cwd(), "client", "src", "lib", "ledgerApi.ts"), "utf8");
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
assertSourceIncludes(
  installerSource,
  'if "%MARO_ALLOW_PUBLIC_TUNNEL%"=="1"',
  "Windows launcher no longer requires an explicit public-tunnel opt-in"
);
assertSourceIncludes(
  installerSource,
  "Public tunnel not started.",
  "Windows launcher no longer reports that an unprotected tunnel was blocked"
);
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

await runNpm("TypeScript contract check", ["run", "check"]);
await runNpm("Build plus encrypted ledger API smoke test", ["run", "check:api"]);

if (process.platform === "win32") {
  await run("Windows installer build", process.execPath, ["scripts/build-windows-installer.mjs"]);
  const installerPath = path.join(process.cwd(), "artifacts", "MARO-Windows11-Setup.exe");
  const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), "maro-installer-smoke-"));
  try {
    await run("Windows installer isolated install", installerPath, [], {
      env: {
        ...process.env,
        MARO_INSTALL_DIR: installRoot,
        MARO_SKIP_SHORTCUTS: "1",
        MARO_SKIP_REGISTRY: "1",
        MARO_SKIP_LAUNCH: "1",
      },
    });

    const requiredFiles = [
      "MARO.cmd",
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

    const installerBytes = fs.readFileSync(installerPath);
    const installerHash = createHash("sha256").update(installerBytes).digest("hex").toUpperCase();
    console.log(`[release-check] Installer SHA-256: ${installerHash}`);
  } finally {
    fs.rmSync(installRoot, { recursive: true, force: true });
  }
} else {
  console.log("\n[release-check] Windows installer build skipped because this host is not Windows.");
}

console.log("\n[release-check] Release gate passed.");
