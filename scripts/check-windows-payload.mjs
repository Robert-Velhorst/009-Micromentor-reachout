import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";

assert.equal(process.platform, "win32", "Windows payload checks require Windows");
const source = ts.createSourceFile("build-windows-installer.mjs", fs.readFileSync(new URL("./build-windows-installer.mjs", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const commands = [];
function visit(node) {
  if (ts.isStringLiteral(node) && node.text.includes("$env:APP_ZIP")) commands.push(node.text);
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(commands.length, 1, "test must execute the real installer archive command");
const artifacts = path.resolve("artifacts");
const root = fs.mkdtempSync(path.join(artifacts, "payload-test-"));
const input = path.join(root, "input with spaces");
const zip = path.join(root, "payload.zip");
const output = path.join(root, "extracted");
function run(command, args, env = {}) {
  const result = spawnSync(command, args, { cwd: input, env: { ...process.env, ...env }, encoding: "utf8", windowsHide: true, timeout: 30000 });
  assert.equal(result.status, 0, `${command}: ${result.error || result.stderr || result.stdout}`);
}
try {
  fs.mkdirSync(path.join(input, "runtime"), { recursive: true });
  fs.mkdirSync(path.join(input, "hidden directory"));
  const expected = new Map([
    ["visible.txt", Buffer.from("visible fixture")],
    ["runtime/node.exe", Buffer.from([0, 1, 2, 255, 128])],
    ["hidden directory/nested.txt", Buffer.from("hidden directory fixture")],
    ["empty.txt", Buffer.alloc(0)],
  ]);
  for (const [relative, bytes] of expected) fs.writeFileSync(path.join(input, relative), bytes);
  run("attrib.exe", ["+H", path.join(input, "runtime", "node.exe")]);
  run("attrib.exe", ["+H", path.join(input, "hidden directory")]);
  run("powershell.exe", ["-NoProfile", "-Command", commands[0]], { APP_ZIP: zip });
  run("powershell.exe", ["-NoProfile", "-Command", "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory($env:TEST_ZIP, $env:TEST_OUTPUT)"], { TEST_ZIP: zip, TEST_OUTPUT: output });
  for (const [relative, bytes] of expected) {
    const extracted = path.join(output, relative);
    assert.ok(fs.existsSync(extracted), `Missing packed file: ${relative}`);
    assert.deepEqual(fs.readFileSync(extracted), bytes, `Changed packed bytes: ${relative}`);
  }
  const before = fs.readFileSync(zip);
  const collision = spawnSync("powershell.exe", ["-NoProfile", "-Command", commands[0]], { cwd: input, env: { ...process.env, APP_ZIP: zip }, encoding: "utf8", windowsHide: true, timeout: 30000 });
  assert.notEqual(collision.status, null, "collision check must finish normally");
  assert.notEqual(collision.status, 0, "an existing archive must not be silently replaced");
  assert.deepEqual(fs.readFileSync(zip), before);
  console.log("PASS Windows payload: hidden runtime, hidden directory, visible/empty files, exact extracted bytes and existing-archive rejection");
} finally {
  assert.equal(path.dirname(fs.realpathSync(root)), fs.realpathSync(artifacts));
  fs.rmSync(root, { recursive: true, force: true });
}
