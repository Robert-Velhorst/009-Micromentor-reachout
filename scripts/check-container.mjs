import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Script } from "node:vm";

const owner = `maro-container-${randomBytes(12).toString("hex")}`;
const volume = `${owner}-data`;
const label = "maro.fixture";
const passphrase = randomBytes(32).toString("hex");
const environment = { ...process.env, MARO_LEDGER_PASSPHRASE: passphrase };
const docker = args => execFileSync("docker", args, { encoding: "utf8", env: environment, timeout: 120000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
const inspect = name => JSON.parse(docker(["inspect", name]))[0];
function optionalInspect(args, missingMessage) {
  try { return JSON.parse(docker(args))[0]; }
  catch (error) {
    if (String(error.stderr).includes(missingMessage)) return undefined;
    throw error;
  }
}
const report = { syntheticOnly: true, providerActions: false, readOnly: true, network: "none" };

async function waitForHealth() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      docker(["exec", owner, "node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"]);
      return;
    } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  throw new Error("Owned app fixture did not become healthy");
}

const probe = String.raw`
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
async function request(route,options={}) {
 const r=await fetch('http://127.0.0.1:3000'+route,options);
 return {status:r.status,headers:r.headers,text:await r.text()};
}
(async()=>{
 const health=await request('/api/health');
 assert.equal(health.status,200); assert.equal(JSON.parse(health.text).ok,true);
 const page=await request('/');
 assert.equal(page.status,200); assert.ok(page.text.includes('<title>MARO - Micromentor Automated Reach Out</title>'));
 assert.equal(page.headers.get('x-content-type-options'),'nosniff');
 assert.match(page.headers.get('content-security-policy'),/default-src 'self'/);
 const headers={'Content-Type':'application/json','X-MARO-Request':'1'};
 if(process.env.MARO_FIXTURE_STAGE==='create') {
  assert.equal((await request('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await request('/api/projects',{method:'POST',headers:{...headers,'Sec-Fetch-Site':'cross-site'},body:'{}'})).status,403);
  const deniedHost=await new Promise((resolve,reject)=>{
   const req=http.get('http://127.0.0.1:3000/api/dashboard',{headers:{Host:'foreign.invalid'}},res=>{res.resume();resolve(res.statusCode)});
   req.on('error',reject);
  });
  assert.equal(deniedHost,421);
  const created=await request('/api/projects',{method:'POST',headers,body:JSON.stringify({title:process.env.MARO_FIXTURE_MARKER,description:'Synthetic container persistence fixture'})});
  assert.equal(created.status,200);
  const {project}=JSON.parse(created.text);
  const stored=fs.readFileSync('/data/maro-ledger.json','utf8');
  assert.equal(JSON.parse(stored).kind,'maro-encrypted-ledger');
  assert.equal(JSON.parse(stored).algorithm,'aes-256-gcm');
  assert.ok(!stored.includes(process.env.MARO_FIXTURE_MARKER));
  assert.equal(process.versions.node,'26.12.1');
  assert.ok(!fs.existsSync('/usr/local/lib/node_modules/npm'));
  console.log(JSON.stringify({projectId:project.id,node:process.versions.node,encryptedAtRest:true,productIdentity:true,securityHeaders:true,unmarkedMutationDenied:true,crossSiteMutationDenied:true,foreignHostDenied:true}));
 } else {
  const {projects}=JSON.parse((await request('/api/projects')).text);
  assert.ok(projects.some(project=>project.id===process.env.MARO_FIXTURE_PROJECT_ID && project.title===process.env.MARO_FIXTURE_MARKER));
  console.log(JSON.stringify({persistedAfterRestart:true}));
 }
})().catch(error=>{console.error(error.message);process.exitCode=1});
`;
new Script(probe, { filename: "container-probe.cjs" });

try {
  docker(["volume", "create", "--label", `${label}=${owner}`, volume]);
  const id = docker(["run", "--detach", "--init", "--name", owner, "--label", `${label}=${owner}`,
    "--network", "none", "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
    "--tmpfs", "/tmp:rw,size=64m", "--mount", `type=volume,source=${volume},target=/data`,
    "--env", "MARO_LEDGER_PASSPHRASE", "maro-web:ci"]);
  const state = inspect(owner);
  assert.equal(state.Id, id); assert.equal(state.Config.Labels[label], owner);
  assert.equal(state.Config.User, "node");
  assert.ok(state.Mounts.every(mount => (mount.Type === "volume" && mount.Name === volume && mount.Destination === "/data") || mount.Type === "tmpfs"));
  await waitForHealth();
  Object.assign(report, JSON.parse(docker(["exec", "--env", "MARO_FIXTURE_STAGE=create", "--env", `MARO_FIXTURE_MARKER=${owner}`, owner, "node", "-e", probe])));
  assert.equal(typeof report.projectId, "string");
  docker(["restart", "--time", "10", owner]);
  await waitForHealth();
  Object.assign(report, JSON.parse(docker(["exec", "--env", "MARO_FIXTURE_STAGE=restart", "--env", `MARO_FIXTURE_MARKER=${owner}`, "--env", `MARO_FIXTURE_PROJECT_ID=${report.projectId}`, owner, "node", "-e", probe])));
  report.outcome = "passed";
} finally {
  const state = optionalInspect(["inspect", owner], "No such object:");
  if (state) {
    assert.equal(state.Config.Labels[label], owner);
    assert.ok(state.Mounts.every(mount => (mount.Type === "volume" && mount.Name === volume) || mount.Type === "tmpfs"));
    docker(["rm", "--force", state.Id]);
  }
  const ownedVolume = optionalInspect(["volume", "inspect", volume], "no such volume");
  if (ownedVolume) {
    assert.equal(ownedVolume.Name, volume); assert.equal(ownedVolume.Labels[label], owner);
    docker(["volume", "rm", volume]);
  }
  report.ownedFixturesRemoved = true;
  const directory = path.join(process.cwd(), "artifacts");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "container-verification.json"), JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify(report));
