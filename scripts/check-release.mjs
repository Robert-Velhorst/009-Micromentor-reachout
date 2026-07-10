import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmExecPath = process.env.npm_execpath || "";
const npmRunner = npmExecPath
  ? { command: process.execPath, argsPrefix: [npmExecPath] }
  : { command: npmCommand, argsPrefix: [] };

function run(label, command, args) {
  console.log(`\n[release-check] ${label}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
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

await runNpm("TypeScript contract check", ["run", "check"]);
await runNpm("Build plus encrypted ledger API smoke test", ["run", "check:api"]);

if (process.platform === "win32") {
  await run("Windows installer build", process.execPath, ["scripts/build-windows-installer.mjs"]);
} else {
  console.log("\n[release-check] Windows installer build skipped because this host is not Windows.");
}

console.log("\n[release-check] Release gate passed.");
