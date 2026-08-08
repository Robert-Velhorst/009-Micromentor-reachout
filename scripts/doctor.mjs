import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const results = [];
const check = (name, ok, detail, required = true) => results.push({ name, ok, detail, required });
const major = Number(process.versions.node.split(".")[0]);
check("Node.js", major >= 20, `${process.version} (20 or newer required)`);
check("Lockfile", fs.existsSync(path.join(root, "package-lock.json")), "package-lock.json is required for reproducible installs");
check("Dependencies", fs.existsSync(path.join(root, "node_modules")), "run npm ci when missing");
check("Build output", fs.existsSync(path.join(root, "dist", "index.cjs")) && fs.existsSync(path.join(root, "dist", "public", "index.html")), "run npm run build when missing", false);

const dataDir = path.resolve(process.env.MARO_DATA_DIR || path.join(root, "data"));
try {
  fs.mkdirSync(dataDir, { recursive: true });
  const probe = path.join(dataDir, `.maro-write-probe-${process.pid}`);
  fs.writeFileSync(probe, "ok", { mode: 0o600 });
  fs.rmSync(probe);
  check("Data directory", true, `${dataDir} is writable`);
} catch (error) {
  check("Data directory", false, error instanceof Error ? error.message : String(error));
}

const ledgerPath = path.join(dataDir, "maro-ledger.json");
if (fs.existsSync(ledgerPath)) {
  try {
    const value = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    const encrypted = value?.kind === "maro-encrypted-ledger";
    check("Ledger format", encrypted || value?.schemaVersion === 1, encrypted ? "encrypted ledger envelope" : "schema version 1 JSON");
    check("Ledger passphrase", !encrypted || Boolean(process.env.MARO_LEDGER_PASSPHRASE), encrypted ? "required for encrypted ledger" : "not required", encrypted);
  } catch (error) {
    check("Ledger format", false, error instanceof Error ? error.message : String(error));
  }
} else {
  check("Ledger format", true, "new workspace will be created on first start", false);
}

const publicTunnelAllowed = process.env.MARO_ALLOW_PUBLIC_TUNNEL === "1";
const basicAuth = Boolean(process.env.NGROK_BASIC_AUTH);
check("Tunnel safety", !publicTunnelAllowed || basicAuth, publicTunnelAllowed && !basicAuth ? "public tunnel opt-in has no Basic Auth" : "local-only or protected tunnel");
check("Outbound safety stop", true, process.env.MARO_OUTBOUND_PAUSED === "1" ? "forced paused by environment" : "controlled by workspace setting", false);
check("HAI connector", true, process.env.MARO_HAI_FEED_ENABLED === "1" ? "read-only generic JSON feed enabled" : "disabled by default", false);
check("Free memory", os.freemem() >= 256 * 1024 * 1024, `${Math.round(os.freemem() / 1024 / 1024)} MB available`, false);

for (const result of results) {
  console.log(`${result.ok ? "PASS" : result.required ? "FAIL" : "WARN"}  ${result.name}: ${result.detail}`);
}
const failed = results.filter((result) => result.required && !result.ok);
if (failed.length) {
  console.error(`\nMARO doctor found ${failed.length} blocking issue(s).`);
  process.exitCode = 1;
} else {
  console.log("\nMARO doctor found no blocking issues.");
}
