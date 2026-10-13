import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { build } from "esbuild";

const source = ts.createSourceFile("Home.tsx", fs.readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const helpers = new Map(), handlers = new Map();
let ledger, dashboard;
function visit(node) {
  if (ts.isJsxElement(node)) {
    const tag = node.openingElement.tagName.getText(source);
    const attribute = (name, value) => node.openingElement.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.getText(source) === name && prop.initializer?.text === value);
    if (tag === "TabsContent" && attribute("value", "ledger")) ledger = node.getText(source);
    if (tag === "section" && attribute("className", "grid gap-4 xl:grid-cols-[1.15fr_0.85fr]")) dashboard = node.getText(source);
  }
  if (ts.isFunctionDeclaration(node) && ['MetricCard', 'MiniStat', 'DiscoveryPlanPanel', 'campaignFollowUpDays', 'campaignTone', 'campaignFitThreshold', 'sourceToForm', 'sourceEditChanged'].includes(node.name?.text)) helpers.set(node.name.text, node.getText(source));
  if (ts.isVariableDeclaration(node)) {
    const name = node.name.getText(source);
    if (['formatCurrency', 'formatDate', 'defaultCampaignForm', 'defaultSourceForm'].includes(name)) helpers.set(name, `const ${name} = ${node.initializer.getText(source)};`);
    if (['applyDiscoveryPlan', 'copyDiscoveryQuery', 'openDiscoverySource'].includes(name)) handlers.set(name, `const ${name} = ${node.initializer.getText(source)};`);
  }
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(ledger && dashboard, 'actual campaign surfaces must exist');
assert.equal(helpers.size, 12);
assert.equal(handlers.size, 3);
const { outputFiles } = await build({
  stdin: {
    contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { AlertTriangle, ClipboardCheck, Copy, Euro, ExternalLink, Plus, Search, Send, Users } from 'lucide-react';
      import { LocaleProvider, useTranslation } from './client/src/lib/locale';
      import { Badge } from './client/src/components/ui/badge';
      import { Button } from './client/src/components/ui/button';
      import { Card, CardContent, CardHeader, CardTitle } from './client/src/components/ui/card';
      import { Input } from './client/src/components/ui/input';
      import { Textarea } from './client/src/components/ui/textarea';
      import { Tabs, TabsContent } from './client/src/components/ui/tabs';
      import { Progress } from './client/src/components/ui/progress';
      ${[...helpers.values()].join('\n')}
      const NextActionPanel = () => <aside>English recommendations</aside>;
      const CampaignReadinessPanel = () => <aside>English readiness</aside>;
      const RuntimeExposurePanel = () => <aside>English runtime</aside>;
      function Fixture({mode}) {
        const { t, locale, number } = useTranslation();
        const empty = mode === 'empty';
        const campaignProject = empty ? null : { id: 'project-1', title: 'Project <title>', description: 'Untranslated project context' };
        const projects = campaignProject ? [campaignProject] : [];
        const campaign = empty ? null : { ...defaultCampaignForm, id: 'campaign-1', title: 'Campaign <title>', projectId: 'project-1', goal: 'Operator goal', totalMentors: 1000, messagesApproved: 2, messagesSent: 3, messagesDrafted: 4, responsesReceived: 5, followUpsDue: 6,
          criteriaJson: { tone: 'keep operator tone', followUpAfterDays: 7, minimumFitScore: 70 } };
        const campaigns = campaign ? [campaign] : [], activeCampaignId = campaign?.id || '';
        const summary = { totals: { mentors: 1000, strongMatches: 500, followUpsDue: 2, drafts: 4, approvals: 3, sent: 2, nextActions: 1, finalCost: 0 } };
        const nextActions = [], progress = 50, strongFitThreshold = 70;
        const campaignSettingsForm = { ...defaultCampaignForm, projectId: 'project-1', title: 'Unsaved campaign <edit>', goal: 'Unsaved goal', status: mode === 'blocked' ? 'completed' : 'active' };
        const campaignSettingsChanged = mode !== 'unchanged', completionBlockedByReadiness = mode === 'blocked';
        const runtimeStatus = null, healthStatus = null, runtimeCopyStatus = '', copyRuntimeUrl = () => {};
        const projectEditForm = { title: 'Unsaved project title', description: 'Unsaved description' }, projectForm = { title: empty ? '' : 'New project', description: '' }, projectContextChanged = mode !== 'unchanged';
        const campaignForm = { ...defaultCampaignForm, title: empty ? '' : 'New campaign', goal: 'New goal' };
        const sourceForm = { ...defaultSourceForm };
        const sourceEdits = {}, assessmentsByMentor = new Map();
        const sourceRecord = { id: 'source-1', name: 'Source <name>', sourceType: 'manual', status: 'searched', resultsFound: 1000, importedCount: 100, notes: 'Unsaved source note', searchQuery: 'keep my query', searchedAt: '2026-10-13T08:00:00Z' };
        const planSource = { id: 'plan-1', name: 'Plan <name>', sourceType: 'manual', status: mode === 'recorded' ? 'recorded' : 'recommended', searchQuery: 'private prepared query', launchUrl: 'https://example.com/directory', rationale: 'English rationale', privacyNote: 'English privacy note' };
        const details = { mentors: [], sourceRecords: empty ? [] : [sourceRecord], readiness: { blockers: 2, attentionItems: 3 }, discoveryPlan: empty ? null : { unrecordedCount: mode === 'recorded' ? 0 : 1, sources: [planSource] } };
        const discoveryStatus = mode === 'copied' ? { message: 'source.copied', sourceName: 'Plan <name>' } : { message: 'source.added', count: 1000 };
        const openDiscoverySource = () => {};
        return <><main>${dashboard}</main><Tabs defaultValue="ledger">${ledger}</Tabs></>;
      }
      export function render(locale, mode = 'normal') {
        return renderToStaticMarkup(<LocaleProvider initialLocale={locale}><Fixture mode={mode}/></LocaleProvider>);
      }
    `,
    resolveDir: process.cwd(), loader: 'tsx',
  }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
});
const context = { module: { exports: {} }, require: createRequire(new URL('../package.json', import.meta.url)), console };
vm.runInNewContext(outputFiles[0].text, context);
const { render } = context.module.exports;
const english = render('en'), dutch = render('nl');
for (const [html, labels] of [[english, ['Campaign overview', 'Save campaign', 'Project context', 'Source searches']], [dutch, ['Campagneoverzicht', 'Campagne opslaan', 'Projectcontext', 'Zoekbronnen']]]) {
  for (const label of labels) assert.ok(html.includes(label), label);
  assert.match(html, /Campaign &lt;title&gt;/);
  assert.match(html, /value="Unsaved campaign &lt;edit&gt;"/);
  assert.match(html, /keep my query/);
  assert.match(html, /keep operator tone/);
  for (const value of ['active', 'paused', 'completed', 'archived', 'planned', 'searched', 'imported', 'skipped']) assert.ok(html.includes(`value="${value}"`), value);
  for (const field of html.matchAll(/<(?:input|textarea|select)\b[^>]*>/g)) assert.match(field[0], /aria-label="[^"]+"/, `unnamed form control: ${field[0]}`);
  const links = [...html.matchAll(/<a\b[^>]*>/g)].map(match => match[0]);
  assert.equal(links.length, 1);
  assert.match(links[0], /href="https:\/\/example.com\/directory"/);
  assert.match(links[0], /target="_blank"/);
  assert.match(links[0], /rel="noopener noreferrer"/);
  assert.doesNotMatch(links[0], /private|prepared|query=/);
  assert.match(html, /lang="en"><aside>English recommendations/);
  assert.match(html, /lang="en"[^>]*>English rationale/);
  assert.match(html, /lang="en"[^>]*>English privacy note/);
}
assert.match(dutch, /Aanbevolen bronnen toegevoegd: 1\.000/);
assert.match(english, /Recommended sources added: 1,000/);
assert.match(dutch, /aria-label="Bron openen: Plan &lt;name&gt; \(nieuw tabblad\)"/);
assert.match(dutch, /aria-label="Campagnevoortgang"/);
assert.match(render('nl', 'copied'), /Zoekopdracht gekopieerd: Plan &lt;name&gt;/);
assert.match(render('en', 'copied'), /Query copied: Plan &lt;name&gt;/);
const blocked = render('nl', 'blocked');
assert.match(blocked, /Afronden is geblokkeerd/);
assert.match(blocked, /Blokkades: 2\. Aandachtspunten: 3\./);
function button(html, label) {
  return [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]).find(markup => markup.includes(label));
}
assert.match(button(blocked, 'Campagne opslaan'), /disabled=""/);
assert.doesNotMatch(button(dutch, 'Campagne opslaan'), /disabled=/);
assert.match(button(render('nl', 'unchanged'), 'Campagne opslaan'), /disabled=""/);
assert.match(button(render('nl', 'recorded'), 'Bronnen toevoegen'), /disabled=""/);
const empty = render('nl', 'empty');
assert.match(empty, /Geen campagne geselecteerd/);
assert.match(empty, /Nog geen zoekbronnen vastgelegd/);
assert.match(button(empty, 'Campagne aanmaken'), /disabled=""/);
assert.match(button(empty, 'Project aanmaken'), /disabled=""/);

// Exercise the actual callbacks; opening is owned by the native link, never a second popup.
const scope = { status: null, count: 2, clipboardFails: false, activeCampaignId: 'campaign-1' };
scope.setDiscoveryStatus = value => { scope.status = value; };
scope.mutate = action => action(()=>true);
scope.ledgerApi = { applyDiscoveryPlan: async id => { assert.equal(id, 'campaign-1'); return { createdSources: Array(scope.count).fill({}) }; } };
scope.copyTextToClipboard = async text => { assert.equal(text, 'private prepared query'); if (scope.clipboardFails) throw new Error('fixture'); };
scope.window = { open: () => assert.fail('opening the link must not also invoke window.open') };
vm.runInNewContext(ts.transpileModule(`${[...handlers.values()].join('\n')}\nglobalThis.actions = { applyDiscoveryPlan, copyDiscoveryQuery, openDiscoverySource };`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, scope);
await scope.actions.applyDiscoveryPlan();
assert.equal(scope.status.message, 'source.added');
assert.equal(scope.status.count, 2);
scope.count = 0;
await scope.actions.applyDiscoveryPlan();
assert.equal(scope.status.message, 'source.allRecorded');
const planSource = { name: 'Operator source', searchQuery: 'private prepared query', launchUrl: 'https://example.com/directory' };
await scope.actions.copyDiscoveryQuery(planSource);
assert.equal(scope.status.message, 'source.copied');
assert.equal(scope.status.sourceName, 'Operator source');
scope.clipboardFails = true;
await scope.actions.copyDiscoveryQuery(planSource);
assert.equal(scope.status.message, 'source.copyFailed');
scope.actions.openDiscoverySource(planSource);
assert.equal(scope.status.message, 'source.openRequested');
assert.equal(scope.status.sourceName, 'Operator source');
console.log('PASS campaign localization: actual dashboard/ledger/discovery rendering, labeled forms, stable enum values, readiness guards, structured notices and safe source links');
