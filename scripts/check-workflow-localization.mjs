import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { build } from "esbuild";

const source = ts.createSourceFile("Home.tsx", fs.readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const panels = new Map(), helpers = [];
const functions = ["ReviewColumn", "SensitiveText", "MessageQualityBox", "MiniStat", "SafetyLine"];
const constants = ["formatCurrency", "formatResourceAmount", "formatDate", "resultFilters"];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && functions.includes(node.name?.text)) helpers.push(node.getText(source));
  if (ts.isVariableDeclaration(node) && constants.includes(node.name.getText(source))) helpers.push(`const ${node.name.getText(source)} = ${node.initializer.getText(source)};`);
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "TabsContent") {
    const value = node.openingElement.attributes.properties.find(item => item.name?.getText(source) === "value")?.initializer?.text;
    if (["review", "responses", "billing"].includes(value)) panels.set(value, node.getText(source));
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(panels.size, 3);
assert.equal(helpers.length, functions.length + constants.length);
const { outputFiles } = await build({stdin:{resolveDir:process.cwd(),loader:"tsx",contents:`
  import React from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { LocaleProvider, useTranslation } from './client/src/lib/locale';
  import { messages } from './client/src/lib/messages';
  import { Check, Send, Eye, EyeOff, ExternalLink, Copy, ClipboardCheck, Download, MessageSquareReply, MailPlus, Activity, ShieldCheck } from 'lucide-react';
  import { Card, CardHeader, CardTitle, CardContent } from './client/src/components/ui/card';
  import { Button as RealButton } from './client/src/components/ui/button';
  import { Badge } from './client/src/components/ui/badge';
  import { Input as RealInput } from './client/src/components/ui/input';
  import { Textarea as RealTextarea } from './client/src/components/ui/textarea';
  import { Tabs, TabsContent } from './client/src/components/ui/tabs';
  import { UncertainDeliveryControl } from './client/src/components/UncertainDeliveryControl';
  let buttons=[], fields=[], calls=[];
  const Button=props=>{buttons.push(props);return <RealButton {...props}/>;};
  const Input=props=>{fields.push(props);return <RealInput {...props}/>;};
  const Textarea=props=>{fields.push(props);return <RealTextarea {...props}/>;};
  ${helpers.join('\n')}
  function Fixture({panel,mode,events}) {
    const calls=events;
    const {t,locale,number}=useTranslation();
    const empty=mode==='empty', privacyMode=mode==='hidden', blocked=mode==='blocked';
    const activeCampaignId='campaign-1';
    const mentor={id:'mentor-1',campaignId:activeCampaignId,name:'QA <mentor>',headline:'Original headline',profileUrl:'https://example.com/profile'};
    const draft={id:'draft-1',mentorProfileId:mentor.id,status:'draft',subject:'Original <subject>',body:'PRIVATE DRAFT'};
    const approved={...draft,id:'approved-1',status:'approved'};
    const pendingReview=empty?[]:[draft], approvedMessages=empty?[]:[approved];
    const follow={id:'follow-1',mentorProfileId:mentor.id,status:'scheduled',dueAt:'2026-09-01T08:00:00Z',suggestedMessage:'PRIVATE FOLLOWUP'};
    const invoice={id:'invoice-1',invoiceNumber:'ORIGINAL-001',generatedAt:'2026-09-01T08:00:00Z',status:'generated',rawResourceCost:0.0001,finalCost:1234.56,measurementNote:'English measurement note'};
    const cost={id:'cost-1',rawResourceCost:0.0001,finalCost:1234.56,pricingFormula:'Original pricing formula'};
    const details={mentors:empty?[]:[mentor],messages:[draft,approved],sendAttempts:[],responses:empty?[]:[{id:'reply-1',mentorProfileId:mentor.id,classification:'more_info',body:'PRIVATE RESPONSE',nextAction:'English generated next action'}],followUps:empty?[]:[follow],billingRecords:empty?[]:[cost],invoiceRecords:empty?[]:[invoice],results:{totals:{contacted:1000,overdueFollowUps:1},rates:{responseRate:12.5,bookingRate:2.5,positiveOutcomeRate:1.5}}};
    const deliverySafety={uncertainAttempts:[],blockedMentorIds:blocked?[mentor.id]:[]};
    const blockedDeliveryMentors=new Set(deliverySafety.blockedMentorIds);
    const draftEdits=mode==='edited'?{[approved.id]:{subject:'Unsaved <subject>',body:'PRIVATE EDIT'}}:{};
    const qualityByMessage=new Map([[draft.id,{status:blocked?'blocked':'pass',metricsJson:{personalizationScore:80,readingTimeSeconds:20,unresolvedTokenCount:0},warningsJson:blocked?['English generated warning']:[]}]]);
    const handoffStatus={},handoffFallback={'approved-1':'PRIVATE FALLBACK'};
    const sendEvidence={'approved-1':'ORIGINAL EVIDENCE'},sendFailureNotes={'approved-1':'ORIGINAL FAILURE'};
    const responseText={[mentor.id]:'UNSAVED REPLY'},responseClass={[mentor.id]:'more_info'};
    const outcomeText={[mentor.id]:'UNSAVED OUTCOME'},outcomeStatus={[mentor.id]:'booked'};
    const resultFilter='all',resultRows=empty?[]:[{mentor,sentCount:1000,latestResponse:details.responses[0],awaitingOutcome:true,outcomeStatusValue:'open',latestFollowUp:follow,hasDueFollowUp:true}];
    const dueFollowUps=details.followUps;
    const latestResourceSession=empty?null:{measurementMode:'process',cpuCoreHours:0.12345678,ramGbHours:0.00000001,bandwidthGb:0.00000002,estimatedKwh:0.00000003,measurementNote:'English process note'};
    const usageReport=empty?null:{totals:{outcomesRecorded:1000,finalCost:1234.56},billingRecords:[cost],invoiceRecords:[invoice],measurementNote:'English usage note'};
    const workspaceSettings={outboundPaused:false},environmentOutboundPause=false;
    const ledgerApi=new Proxy({}, {get:(_,name)=>(...args)=>{calls.push([name,...args]);return Promise.resolve({});}});
    const mutate=action=>action(()=>true),submitDeliveryChange=action=>action(),loadLedger=async()=>{};
    const isSensitiveVisible=()=>!privacyMode;
    const revealSensitive=key=>calls.push(['reveal',key]),hideSensitive=key=>calls.push(['hide',key]);
    const setDraftEdits=update=>calls.push(['edit',update(draftEdits)]);
    const setSendEvidence=()=>{},setSendFailureNotes=()=>{},setDeliverySafety=()=>{};
    const setResultFilter=value=>calls.push(['filter',value]),setSelectedMentorId=()=>{};
    const setOutcomeStatus=()=>{},setOutcomeText=()=>{},setResponseClass=()=>{},setResponseText=()=>{};
    const recordOutcome=mentor=>calls.push(['outcome',mentor.id]),recordResponse=mentor=>calls.push(['response',mentor.id]);
    const exportCampaignHistoryCsv=()=>calls.push(['export',activeCampaignId]);
    const copyDraftForHandoff=message=>calls.push(['copy',message.id]),copyExtensionHandoff=message=>calls.push(['extension',message.id]),openProfileForHandoff=(...args)=>calls.push(['profile',...args]);
    const navigateToTab=value=>calls.push(['tab',value]);
    const loadUsageReport=()=>calls.push(['usage',activeCampaignId]),generateInvoiceReport=()=>calls.push(['invoice',activeCampaignId]);
    return <Tabs defaultValue={panel}>{panel==='review'?${panels.get('review')}:panel==='responses'?${panels.get('responses')}:${panels.get('billing')}}</Tabs>;
  }
  function text(children) { return React.Children.toArray(children).map(child=>typeof child==='string'?child:React.isValidElement(child)?text(child.props.children):'').join('').trim(); }
  export function render(locale,panel,mode='normal') {
    buttons=[];fields=[];calls=[];
    const html=renderToStaticMarkup(<LocaleProvider initialLocale={locale}><Fixture panel={panel} mode={mode} events={calls}/></LocaleProvider>);
    return {html,buttons:buttons.map(props=>({...props,name:props['aria-label']||text(props.children)})),fields,calls};
  }
  export {messages};
`},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',jsx:'automatic'});
const context={module:{exports:{}},require:createRequire(new URL('../package.json',import.meta.url)),console};
vm.runInNewContext(outputFiles[0].text,context);
const {render,messages}=context.module.exports;
for (const locale of ['en','nl']) {
  const t=key=>messages[locale][key];
  const review=render(locale,'review');
  assert.ok(review.html.includes(t('review.pending')));
  assert.ok(review.html.includes(t('review.approved')));
  assert.match(review.html,/Original &lt;subject&gt;/);
  assert.match(review.html,/PRIVATE DRAFT/);
  const button=(result,key)=>result.buttons.find(item=>item.name===t(key));
  assert.equal(button(review,'review.approve').disabled,false);
  assert.match(button(review,'review.confirm').className,/h-auto.*whitespace-normal/, 'Long send confirmation must wrap rather than clip');
  for (const key of ['review.copy','review.extensionCopy','review.return']) {
    assert.match(button(review,key).className,/h-auto.*whitespace-normal/, 'Review actions must wrap inside their own containers');
  }
  await button(review,'review.approve').onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(review.calls[0])),['approveDraft','draft-1','Approved in command center']);
  review.buttons.find(item=>item.name===t('review.copy')&&!item.disabled).onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(review.calls.at(-1))),['copy','approved-1']);
  const subject=review.fields.find(field=>field['aria-label']?.startsWith(t('review.subject')));
  subject.onChange({target:{value:'EXACT <edit>'}});
  assert.equal(review.calls.at(-1)[1]['draft-1'].subject,'EXACT <edit>');
  assert.equal(review.calls.at(-1)[1]['draft-1'].body,'PRIVATE DRAFT');
  const hidden=render(locale,'review','hidden');
  assert.doesNotMatch(hidden.html,/PRIVATE DRAFT|PRIVATE FALLBACK/);
  assert.ok(hidden.fields.some(field=>field.type==='password'&&field.value==='ORIGINAL EVIDENCE'));
  assert.ok(hidden.fields.some(field=>field.type==='password'&&field.value==='ORIGINAL FAILURE'));
  hidden.buttons.find(item=>item.name===t('sensitive.reveal')+': '+t('review.failure')).onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(hidden.calls.at(-1))),['reveal','send-failure:approved-1']);
  const blocked=render(locale,'review','blocked');
  assert.match(blocked.html,/lang="en"[^>]*>English generated warning/);
  assert.equal(button(blocked,'review.approve').disabled,true);
  assert.equal(button(blocked,'review.confirm').disabled,true);
  assert.ok(blocked.buttons.filter(b=>b.name===t('review.copy')).every(b=>b.disabled));
  const edited=render(locale,'review','edited');
  assert.equal(button(edited,'review.confirm').disabled,true);
  assert.equal(button(edited,'review.return').disabled,false);
  assert.match(edited.html,/Unsaved &lt;subject&gt;/);
  assert.ok(render(locale,'review','empty').html.includes(t('review.empty')));
  const responses=render(locale,'responses');
  assert.match(button(responses,'intake.exportHistory').className,/h-auto.*max-w-full.*whitespace-normal/, 'Long export label must fit its panel');
  assert.ok(responses.html.includes(t('response.inbox')));
  assert.ok(responses.html.includes(t('detail.response.more_info')));
  assert.match(responses.html,/value="more_info" selected=""/);
  assert.match(responses.html,/value="booked" selected=""/);
  assert.match(responses.html,/UNSAVED REPLY|UNSAVED OUTCOME/);
  assert.doesNotMatch(render(locale,'responses','hidden').html,/PRIVATE RESPONSE/);
  button(responses,'results.follow_up_due').onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(responses.calls.at(-1))),['filter','follow_up_due']);
  button(responses,'response.save').onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(responses.calls.at(-1))),['response','mentor-1']);
  for (const value of ['open','booked','helpful','declined','no_response','not_relevant','closed','interested','more_info','not_interested','unavailable','unknown']) assert.ok(responses.html.includes('value="'+value+'"'));
  const billing=render(locale,'billing');
  assert.ok(billing.html.includes(t('billing.localOnly')));
  assert.match(billing.html,/ORIGINAL-001/);
  assert.match(billing.html,/lang="en"[^>]*>English process note/);
  assert.ok(billing.html.includes(locale==='nl'?'0,12345678':'0.12345678'));
  assert.ok(billing.html.includes(locale==='nl'?'1.234,56':'1,234.56'));
  button(billing,'billing.generate').onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(billing.calls.at(-1))),['closeResourceSession','campaign-1']);
  button(billing,'billing.complete').onClick();
  assert.deepEqual(JSON.parse(JSON.stringify(billing.calls.at(-1))),['completeFollowUp','follow-1']);
  assert.doesNotMatch(render(locale,'billing','hidden').html,/PRIVATE FOLLOWUP/);
  const emptyBilling=render(locale,'billing','empty');
  assert.equal(button(emptyBilling,'billing.invoice').disabled,true);
  for (const result of [review,responses,billing]) {
    for (const field of result.fields) assert.ok(field['aria-label']?.trim(), 'Workflow inputs/textareas need accessible names');
  }
  for (const field of responses.html.matchAll(/<select\b[^>]*>/g)) assert.match(field[0],/aria-label="[^"]+"/);
}
console.log('PASS workflow localization: actual review/response/billing panels in EN/NL, private-content hiding, unchanged records and status values, localized precision, accessible fields, safety guards and exact action callbacks');
