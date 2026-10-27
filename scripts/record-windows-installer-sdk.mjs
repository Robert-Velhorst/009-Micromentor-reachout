import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

assert.equal(process.platform, "win32");
assert.equal(process.env.GITHUB_ACTIONS, "true");
assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
assert.equal(process.env.GITHUB_REPOSITORY, "Robert-Velhorst/009-Micromentor-reachout");
const root = process.cwd();
const output = path.join(root, "artifacts", "windows-sdk-evidence");
fs.mkdirSync(output, { recursive: true });
const hash = (data) => createHash("sha256").update(data).digest("hex");
const write = (name, value) => fs.writeFileSync(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`);
function snapshot() {
  const records = {};
  const tree = execFileSync("git", ["ls-tree", "-r", "-z", "HEAD"]).toString("utf8");
  for (const row of tree.split("\0").filter(Boolean)) {
    const tab = row.indexOf("\t");
    const [mode, kind, blob] = row.slice(0, tab).split(" ");
    const name = row.slice(tab + 1);
    assert.equal(kind, "blob");
    const data = fs.readFileSync(path.join(root, name));
    assert.equal(createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex"), blob, name);
    records[name] = { mode, blob, sha256: hash(data) };
  }
  return {
    head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim(),
    payloads: records,
  };
}
if (process.argv[2] === "before") {
  write("source-before.json", snapshot());
  process.exit(0);
}
assert.equal(process.argv[2], "after");
const profile = JSON.parse(fs.readFileSync(path.join(root, "installer-sdk.json"), "utf8"));
const summary = { releaseCheckOutcome: process.env.RELEASE_CHECK_OUTCOME, operatorDataOrDeploymentAcceptance: false, fullPublisherSdkAcceptance: false };
try {
  const before = JSON.parse(fs.readFileSync(path.join(output, "source-before.json"), "utf8"));
  const after = snapshot();
  assert.deepEqual(after, before);
  write("source-after.json", after);
  assert.equal(process.versions.node, profile.nodeVersion);
  const nodeHash = hash(fs.readFileSync(process.execPath));
  assert.equal(nodeHash, profile.nodeExeSha256[process.arch]);
  const sdkVersion = execFileSync("dotnet", ["--version"], { encoding: "utf8" }).trim();
  assert.equal(sdkVersion, profile.dotnetSdkVersion);
  const sdkList = execFileSync("dotnet", ["--list-sdks"], { encoding: "utf8" });
  const row = sdkList.split(/\r?\n/).find((line) => line.startsWith(`${sdkVersion} [`));
  assert.ok(row);
  const sdkRoot = row.slice(`${sdkVersion} [`.length, -1);
  const compiler = path.join(sdkRoot, sdkVersion, "Roslyn", "bincore", "csc.dll");
  const host = execFileSync("where.exe", ["dotnet"], { encoding: "utf8" }).trim().split(/\r?\n/)[0];
  const signatureScript = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $rows=@(); foreach($item in @(@{name='dotnet';path=$env:MARO_DOTNET_HOST},@{name='node';path=$env:MARO_NODE_HOST})) { $sig=Get-AuthenticodeSignature -LiteralPath $item.path; $rows+=@{name=$item.name;path=$item.path;status=$sig.Status.ToString();subject=$sig.SignerCertificate.Subject} }; ConvertTo-Json -InputObject $rows -Depth 5 -Compress";
  const signatures = JSON.parse(execFileSync("pwsh", ["-NoProfile", "-NonInteractive", "-Command", signatureScript], {
    encoding: "utf8", env: { ...process.env, MARO_DOTNET_HOST: host, MARO_NODE_HOST: process.execPath },
  }));
  assert.ok(signatures.every((entry) => entry.status === "Valid"));
  assert.match(signatures.find((entry) => entry.name === "dotnet").subject, /Microsoft/i);
  const generated = path.join(root, "artifacts", "windows-installer");
  const configPath = path.join(generated, "bin", "Release", "net10.0-windows", profile.runtimeIdentifiers[process.arch], "MARO-Windows11-Setup.runtimeconfig.json");
  const runtimeConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.ok(runtimeConfig.runtimeOptions.includedFrameworks.some((entry) => entry.name === "Microsoft.NETCore.App" && entry.version === profile.dotnetRuntimeVersion));
  assert.equal(runtimeConfig.runtimeOptions.framework, undefined);
  fs.copyFileSync(configPath, path.join(output, "compiled-installer.runtimeconfig.json"));
  const installer = path.join(root, "artifacts", "MARO-Windows11-Setup.exe");
  const installerHash = hash(fs.readFileSync(installer));
  const payloadHash = hash(fs.readFileSync(path.join(generated, "maro-app.zip")));
  const stagedFiles = {};
  function files(folder, prefix = "") {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) files(path.join(folder, entry.name), `${name}/`);
      else { assert.ok(entry.isFile()); stagedFiles[name] = hash(fs.readFileSync(path.join(folder, entry.name))); }
    }
  }
  files(path.join(generated, "app"));
  assert.equal(stagedFiles["runtime/node.exe"], nodeHash);
  assert.equal(process.env.RELEASE_CHECK_OUTCOME, "success");
  Object.assign(summary, {
    sourceHead: before.head, sourceTree: before.tree, unchangedSourcePayloads: Object.keys(before.payloads).length,
    actualNodeVersion: process.versions.node, actualNodeSha256: nodeHash, actualDotnetSdkVersion: sdkVersion,
    compilerPath: compiler, compilerSha256: hash(fs.readFileSync(compiler)), publisherHostSignatures: signatures,
    selfContainedRuntimeConfig: runtimeConfig, generatedCSharpSha256: hash(fs.readFileSync(path.join(generated, "MAROInstaller.cs"))),
    generatedProjectSha256: hash(fs.readFileSync(path.join(generated, "MAROInstaller.csproj"))),
    installerSha256: installerHash, installerPayloadZipSha256: payloadHash, stagedPayloadFiles: stagedFiles,
    artifactReleaseSigningOrOperatorAcceptance: false, currentCompilerBuildAndOriginalReleaseCasesPass: true,
  });
} catch (error) {
  Object.assign(summary, { currentCompilerBuildAndOriginalReleaseCasesPass: false, failure: `${error.name}: ${error.message}` });
  process.exitCode = 1;
} finally {
  write("runtime-and-source.json", summary);
}
