import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

assert.equal(process.platform, "win32");
assert.equal(process.env.GITHUB_ACTIONS, "true");
assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
assert.equal(process.env.GITHUB_REPOSITORY, "Robert-Velhorst/009-Micromentor-reachout");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "maro-owned-upgrade-cases-"));
const installer = path.resolve("artifacts/MARO-Windows11-Setup.exe");
const evidence = path.resolve("artifacts/windows-sdk-evidence/upgrade-cases.json");
const results = [];
const hash = (data) => createHash("sha256").update(data).digest("hex");
const env = { ...process.env, MARO_SKIP_SHORTCUTS: "1", MARO_SKIP_REGISTRY: "1", MARO_SKIP_LAUNCH: "1" };
function runInstall(target, expected, extra = {}) {
  assert.ok(path.resolve(target).startsWith(`${root}${path.sep}`));
  const result = spawnSync(installer, [], {
    env: { ...env, MARO_INSTALL_DIR: target, ...extra }, shell: false, windowsHide: true, encoding: "utf8",
  });
  assert.equal(result.error, undefined);
  if (expected === "pass") assert.equal(result.status, 0, result.stdout + result.stderr);
  else assert.notEqual(result.status, 0, "The installer unexpectedly accepted an unsafe target.");
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
function caseOf(name, body) {
  try { const details = body(); results.push({ name, passed: true, ...details }); }
  catch (error) { results.push({ name, passed: false, failure: String(error) }); throw error; }
}
function seedData(target) {
  const fixtures = {
    "data/maro-ledger.json": Buffer.from('{"syntheticUpgradeCase":true,"privateNotes":"retained"}\n'),
    "private-notes.txt": Buffer.from("synthetic user notes\r\n"),
    "attachments/original.bin": Buffer.from([0, 255, 1, 128, 13, 10, 42]),
  };
  fs.mkdirSync(path.join(target, "empty-user-directory"));
  for (const [name, data] of Object.entries(fixtures)) {
    fs.mkdirSync(path.dirname(path.join(target, name)), { recursive: true });
    fs.writeFileSync(path.join(target, name), data);
  }
  return fixtures;
}
function expectData(target, fixtures) {
  for (const [name, data] of Object.entries(fixtures)) assert.deepEqual(fs.readFileSync(path.join(target, name)), data, name);
  assert.ok(fs.statSync(path.join(target, "empty-user-directory")).isDirectory());
}
function snapshot(target) {
  const rows = {};
  function visit(folder, prefix = "") {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) visit(path.join(folder, entry.name), `${name}/`);
      else if (entry.isFile()) rows[name] = hash(fs.readFileSync(path.join(folder, entry.name)));
      else rows[name] = "reparse:" + fs.readlinkSync(path.join(folder, entry.name));
    }
  }
  visit(target);
  return rows;
}
try {
  caseOf("owned upgrade preserves every old file in recovery and carries default ledger/user bytes forward", () => {
    const target = path.join(root, "current");
    runInstall(target, "pass");
    const fixtures = seedData(target);
    const before = snapshot(target);
    const execution = runInstall(target, "pass");
    assert.deepEqual(snapshot(`${target}.maro-recovery`), before);
    expectData(target, fixtures);
    assert.ok(fs.readFileSync(path.join(target, "dist/index.cjs")).length > 0);
    const after = snapshot(target);
    runInstall(target, "fail");
    assert.deepEqual(snapshot(target), after);
    assert.deepEqual(snapshot(`${target}.maro-recovery`), before);
    return { execution, oldPayloadsPreserved: Object.keys(before).length, syntheticData: Object.fromEntries(Object.entries(fixtures).map(([name, data]) => [name, hash(data)])), checkpointNotOverwritten: true };
  });
  caseOf("legacy ownership marker preserves default data and a complete old-program recovery", () => {
    const target = path.join(root, "legacy");
    runInstall(target, "pass");
    const marker = path.join(target, "MARO.install.json");
    const data = JSON.parse(fs.readFileSync(marker, "utf8"));
    delete data.managedFiles;
    fs.writeFileSync(marker, JSON.stringify(data));
    const fixtures = seedData(target);
    const before = snapshot(target);
    runInstall(target, "pass");
    expectData(target, fixtures);
    assert.deepEqual(snapshot(`${target}.maro-recovery`), before);
    return { oldPayloadsPreserved: Object.keys(before).length };
  });
  caseOf("nonempty unowned directory is refused without changing its contents", () => {
    const target = path.join(root, "unowned");
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, "sentinel.bin"), Buffer.from([1, 2, 3, 255]));
    const before = snapshot(target);
    const execution = runInstall(target, "fail");
    assert.deepEqual(snapshot(target), before);
    assert.equal(fs.existsSync(`${target}.maro-recovery`), false);
    return { execution };
  });
  caseOf("user-file collision rolls the original installation back with every byte retained", () => {
    const target = path.join(root, "collision");
    runInstall(target, "pass");
    const marker = path.join(target, "MARO.install.json");
    const data = JSON.parse(fs.readFileSync(marker, "utf8"));
    data.managedFiles = data.managedFiles.filter((name) => name !== "README-INSTALL.txt");
    fs.writeFileSync(marker, JSON.stringify(data));
    fs.writeFileSync(path.join(target, "README-INSTALL.txt"), "synthetic unrecognized user file");
    const fixtures = seedData(target);
    const before = snapshot(target);
    const execution = runInstall(target, "fail");
    assert.deepEqual(snapshot(target), before);
    expectData(target, fixtures);
    return { execution, originalRestored: true };
  });
  caseOf("junction target is refused and linked content remains intact", () => {
    const protectedDir = path.join(root, "junction-content");
    fs.mkdirSync(protectedDir);
    fs.writeFileSync(path.join(protectedDir, "sentinel.txt"), "synthetic junction content");
    const target = path.join(root, "junction-target");
    fs.symlinkSync(protectedDir, target, "junction");
    const before = snapshot(protectedDir);
    runInstall(target, "fail");
    assert.deepEqual(snapshot(protectedDir), before);
    assert.ok(fs.lstatSync(target).isSymbolicLink());
    return { linkedContentUnchanged: true };
  });
  caseOf("configured data inside a managed program root blocks before moving the install", () => {
    const target = path.join(root, "custom-data");
    runInstall(target, "pass");
    const before = snapshot(target);
    runInstall(target, "fail", { MARO_DATA_DIR: path.join(target, "dist", "private-data") });
    assert.deepEqual(snapshot(target), before);
    assert.equal(fs.existsSync(`${target}.maro-recovery`), false);
    return { originalUnchanged: true };
  });
  assert.equal(results.length, 6);
} finally {
  fs.writeFileSync(evidence, JSON.stringify({ cases: results, allSixPass: results.length === 6 && results.every((row) => row.passed), originalReleaseHelperEdited: false, realUserDataOrOperatorAcceptance: false }, null, 2) + "\n");
  assert.ok(path.resolve(root).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
  // Only synthetic files made by this owned worker, including its recovery/staging directories.
  fs.rmSync(root, { recursive: true, force: true });
}
