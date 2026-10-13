import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = ts.createSourceFile('Home.tsx', fs.readFileSync(new URL('../client/src/pages/Home.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['captureView', 'refreshAfterChange', 'reportActionFailure', 'submitDeliveryChange', 'mutate', 'navigateToTab', 'navigateToCampaign', 'addMentor', 'createProject', 'createCampaign', 'loadUsageReport', 'generateInvoiceReport', 'openNextAction'];
const handlers = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(source))) handlers.set(node.name.getText(source), `const ${node.name.getText(source)} = ${node.initializer.getText(source)};`);
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(handlers.size, names.length, 'Exercise every required actual Home handler');
const code = ts.transpileModule([...handlers.values()].join('\n') + `\n({${[...handlers.keys()].join(',')}});`, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes,no) => {resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function fixture() {
  const pending = deferred(), reads = [], events = [];
  const state = {tab:'mentors',mentorForm:{name:'new entry'},campaignId:'A',projectForm:{title:'new project'},campaignForm:{title:'new campaign'}};
  const scope = {
    Error, Promise, activeCampaignId:'A', viewRevision:{current:0}, t:key=>key,
    defaultMentorForm:{name:''}, mentorForm:{name:'submitted'},details:{sourceRecords:[]},
    defaultProjectForm:{title:''}, projectForm:{title:'submitted'},defaultCampaignForm:{title:''},campaignForm:{title:'submitted',skills:'',industries:'',locations:''},
    campaignProject:{id:'P'},projects:[],splitCriteriaList:()=>[],actionTabMap:{review_draft:'review'},
    loadLedger:async (...args)=>{reads.push(args);},
    ledgerApi: new Proxy({}, {get:(_target,name)=>(...args)=>{events.push(['api',name,...args]);return pending.promise;}}),
  };
  for (const [name,key] of Object.entries({setError:'error',setBackgroundNotice:'notice',setMentorForm:'mentorForm',setProjectForm:'projectForm',setCampaignForm:'campaignForm',setActiveCampaignId:'campaignId',setActiveTab:'tab',setUsageReport:'usage',setSelectedMentorId:'mentor',setQuery:'query',setCsvSourceRecordId:'csvSource',setSourceFilterId:'sourceFilter',setResultFilter:'resultFilter'})) {
    scope[name] = value => {state[key] = typeof value === 'function' ? value(state[key]) : value;events.push([name,state[key]]);};
  }
  const actions = vm.runInNewContext(code,scope);
  return {scope,state,pending,reads,events,...actions};
}
{
  const f = fixture();
  const saving = f.mutate(()=>f.pending.promise);
  f.scope.viewRevision.current++;
  f.pending.resolve({}); await saving;
  assert.equal(f.reads.length,0,'A mutation from an older view must not refresh its captured campaign');
  assert.equal(f.state.notice?.message,'navigation.saved');
}
{
  const f = fixture();
  const saving = f.mutate(()=>f.pending.promise);
  f.scope.viewRevision.current++;
  f.pending.reject(new Error('old view write failed')); await saving;
  assert.equal(f.state.notice?.message,'navigation.failed');
  assert.equal(f.state.notice?.details,'old view write failed','A stale action failure must remain visible without replacing current-view errors');
  assert.equal(f.reads.length,0);
}
for (const stale of [false,true]) {
  const f = fixture();
  const saving = f.addMentor();
  if(stale) f.scope.viewRevision.current++;
  f.pending.resolve({mentor:{id:'M'}}); await saving;
  assert.equal(f.state.mentorForm.name,stale?'new entry':'');
  assert.equal(f.reads.length,stale?0:1);
}
for (const operation of ['createProject','createCampaign','generateInvoiceReport','loadUsageReport']) {
  for (const stale of [false,true]) {
    const f = fixture();
    const action = f[operation]();
    if(stale) f.scope.viewRevision.current++;
    f.pending.resolve({project:{id:'P2'},campaign:{id:'B'},usageReport:{marker:'A'}}); await action;
    if(stale) {
      assert.equal(f.reads.length,0,operation);
      assert.equal(f.state.campaignId,'A',operation);
      assert.equal(f.state.projectForm.title,'new project',operation);
      assert.equal(f.state.campaignForm.title,'new campaign',operation);
      assert.equal(f.state.usage,undefined,operation);
    } else {
      assert.equal(f.reads.length,operation==='loadUsageReport'?0:1,operation);
      if(operation==='createCampaign') assert.equal(f.state.campaignId,'B');
    }
  }
}
{
  const f = fixture();
  f.navigateToTab('review');
  assert.equal(f.state.tab,'review');
  assert.equal(f.scope.viewRevision.current,1);
  await f.navigateToCampaign('B');
  assert.equal(f.scope.viewRevision.current,2);
  assert.equal(f.reads[0][0],'B');
}
{
  const f = fixture(), reading=deferred();
  f.scope.loadLedger=()=>reading.promise;
  const opening=f.openNextAction({campaignId:'B',mentorProfileId:'M',type:'review_draft'});
  f.navigateToTab('billing');
  reading.resolve(); await opening;
  assert.equal(f.state.tab,'billing','Late action navigation must not undo a newer tab choice');
  assert.equal(f.state.mentor,undefined);
}
for (const fails of [false,true]) {
  const f = fixture();
  const saving = f.submitDeliveryChange(()=>f.pending.promise);
  f.navigateToTab('billing');
  if (fails) {
    const rejected = assert.rejects(saving, /unknown delivery result/);
    f.pending.reject(new Error('unknown delivery result'));
    await rejected;
    assert.equal(f.state.notice?.message,'navigation.failed');
  } else {
    f.pending.resolve({}); await saving;
    assert.equal(f.state.notice?.message,'navigation.saved');
  }
  assert.equal(f.reads.length,0);
  assert.equal(f.state.tab,'billing');
}
{
  const f = fixture();
  const olderSave=f.mutate(()=>f.pending.promise);
  const creating=f.createCampaign();
  f.pending.resolve({campaign:{id:'B'}});
  await Promise.all([olderSave,creating]);
  assert.equal(f.reads.length,1,'Creating a campaign supersedes older action refreshes');
  assert.equal(f.reads[0][0],'B');
  assert.equal(f.state.campaignId,'B');
}
{
  const f = fixture(), reading=deferred();
  f.scope.loadLedger=(_id,options)=>{
    assert.equal(options.isCurrentView(),true);
    return reading.promise;
  };
  const refreshing=f.refreshAfterChange(f.captureView());
  f.navigateToTab('billing');
  reading.resolve(); await refreshing;
  assert.equal(f.state.notice?.message,'navigation.saved');
}
console.log('PASS navigation completion: old-view writes preserve current campaign/forms, stale failures remain visible, billing stays scoped, current-view success refreshes, delivery failures propagate and newer navigation wins');
