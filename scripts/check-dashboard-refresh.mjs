import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = ts.createSourceFile("Home.tsx", fs.readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let load;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "loadLedger") load = node.initializer.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(load, "Exercise the actual dashboard loading handler");
const code = ts.transpileModule(`const loadLedger = ${load}; loadLedger;`, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
function fixture() {
  const reads = [], events = [];
  const state = {details: {marker: 'initial'}, deliverySafety: {blockedMentorIds:['protected']}, draftEdits: {draft:'unsaved'}, runtimeStatus: {marker:'current'}, error:'', loading:false};
  const barrier = {revision:0,pendingWrites:0};
  const scope = {
    Error, Promise, activeCampaignId:'original', runtimeStatus:{marker:'captured'},
    localeRevision:{current:0}, localeWritesPending:{current:0}, ledgerReadRequest:{current:0},
    t: key => key,
    ledgerApi: {
      readState: () => ({...barrier}),
      dashboard: campaignId => { const read = deferred(); reads.push({...read,campaignId}); return read.promise; },
      workspaceSettings: async () => ({settings:{locale:'en'},environmentOutboundPause:false}),
      runtimeStatus: async () => ({marker:'refreshed'}),
    },
  };
  for (const key of ['loading','error','summary','projects','campaigns','activeCampaignId','details','deliverySafety','healthStatus','runtimeStatus','haiStatus','workspaceSettings','environmentOutboundPause','draftEdits','locale','usageReport','backgroundNotice']) {
    scope['set' + key[0].toUpperCase() + key.slice(1)] = value => {state[key] = value; events.push([key,value]);};
  }
  const loadLedger = vm.runInNewContext(code, scope);
  const snapshot = campaignId => ({summary:{marker:campaignId},projects:[],campaigns:[],selectedCampaignId:campaignId,details:{marker:campaignId},deliverySafety:{blockedMentorIds:[campaignId]},health:{ok:true},haiStatus:{}});
  return {loadLedger,state,barrier,events,reads,snapshot};
}
for (const oldFails of [false,true]) {
  const f = fixture();
  const older = f.loadLedger('old');
  const newer = f.loadLedger('new');
  f.reads[1].resolve(f.snapshot('new'));
  await newer;
  f.state.draftEdits = {draft:'typed after fresh load'};
  const before = JSON.stringify(f.state);
  if (oldFails) f.reads[0].reject(new Error('obsolete error'));
  else f.reads[0].resolve(f.snapshot('old'));
  await older;
  assert.equal(JSON.stringify(f.state), before, 'Late older success/error must not overwrite the latest campaign, guard, edit or error state');
}
{
  const f = fixture();
  const older = f.loadLedger('old');
  const newer = f.loadLedger('new');
  f.reads[0].resolve(f.snapshot('old')); await older;
  assert.equal(f.state.loading, true, 'Older completion must not finish the latest loading indicator');
  assert.equal(f.state.details.marker, 'initial');
  f.reads[1].reject(new Error('latest load failed')); await newer;
  assert.equal(f.state.error, 'latest load failed');
  assert.equal(f.state.loading, false);
}
for (const phase of ['started-during-read','finished-during-read','already-pending']) {
  const f = fixture();
  if (phase === 'already-pending') f.barrier.pendingWrites = 1;
  const reading = f.loadLedger();
  if (phase !== 'already-pending') f.barrier.revision++;
  if (phase === 'started-during-read') f.barrier.pendingWrites = 1;
  f.reads[0].resolve(f.snapshot('stale'));
  await reading;
  assert.equal(f.state.details.marker, 'initial', phase);
  assert.deepEqual(f.state.deliverySafety.blockedMentorIds, ['protected'], phase);
  assert.equal(f.state.draftEdits.draft, 'unsaved', phase);
  assert.equal(f.state.error, 'refresh.changed');
  assert.equal(f.state.loading, false);
  f.barrier.pendingWrites = 0;
  const fresh = f.loadLedger(); f.reads[1].resolve(f.snapshot('fresh')); await fresh;
  assert.equal(f.state.details.marker, 'fresh', 'Explicit stable refresh must reconcile after a write');
}
{
  const f = fixture();
  const explicit = f.loadLedger('same', {refreshRuntime:true}); f.reads[0].resolve(f.snapshot('same')); await explicit;
  assert.equal(f.state.runtimeStatus.marker, 'refreshed');
  const ordinary = f.loadLedger('same'); f.reads[1].resolve(f.snapshot('same')); await ordinary;
  assert.equal(f.state.runtimeStatus.marker, 'refreshed', 'Ordinary refresh must not restore runtime data captured by an older closure');
}
for (const fails of [false,true]) {
  const f = fixture();
  let current = true;
  const reading = f.loadLedger('original', {isCurrentView:()=>current});
  current = false;
  f.state.error = 'new view error';
  if (fails) f.reads[0].reject(new Error('obsolete refresh failed'));
  else f.reads[0].resolve(f.snapshot('original'));
  await reading;
  assert.equal(f.state.details.marker,'initial');
  assert.equal(f.state.draftEdits.draft,'unsaved');
  assert.equal(f.state.error,'new view error');
  assert.equal(f.state.loading,false);
}
console.log('PASS dashboard refresh: latest request owns data/errors/loading; write-spanning reads preserve guards and edits; stable refresh reconciles; runtime state is retained; obsolete automatic refreshes preserve newer views');
