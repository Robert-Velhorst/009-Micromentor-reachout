import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { build } from "esbuild";

// Render the actual mentor tab, replacing only its state and unrelated detail panel.
const source = ts.createSourceFile("Home.tsx", fs.readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let tab;
const declarations = new Map();
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "TabsContent"
    && node.openingElement.attributes.properties.some((prop) => ts.isJsxAttribute(prop) && prop.name.getText(source) === "value" && prop.initializer?.text === "mentors")) tab = node;
  if (ts.isVariableDeclaration(node) && ["csvColumnFields", "stageLabel", "readCsvFile"].includes(node.name.getText(source))) declarations.set(node.name.getText(source), node.initializer.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(tab, "actual mentor tab must exist");
assert.equal(declarations.size, 3);
const { outputFiles } = await build({
  stdin: {
    contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { Ban, CirclePlay, Eye, EyeOff, FileText, Plus, Search } from 'lucide-react';
      import { LocaleProvider, useTranslation } from './client/src/lib/locale';
      import { Badge } from './client/src/components/ui/badge';
      import { Button } from './client/src/components/ui/button';
      import { Card, CardContent, CardHeader, CardTitle } from './client/src/components/ui/card';
      import { Input } from './client/src/components/ui/input';
      import { Textarea } from './client/src/components/ui/textarea';
      import { Tabs, TabsContent } from './client/src/components/ui/tabs';
      import { MentorPagination } from './client/src/components/MentorPagination';
      import { WorkspaceNotice } from './client/src/components/WorkspaceNotice';
      const csvColumnFields = ${declarations.get("csvColumnFields")};
      const stageLabel = ${declarations.get("stageLabel")};
      const MentorDetailPanel = () => <aside>Detail panel fixture</aside>;
      function Fixture({ mode }) {
        const { t, locale, number } = useTranslation();
        const mentor = { id: 'mentor-1', name: 'Untranslated <Name>', headline: 'Operator text', bio: '',
          source: '', stage: 'new', notes: 'Unsaved <notes>', industries: ['Energy'], location: 'Arnhem', doNotContact: mode === 'blocked' };
        const visibleMentors = ['empty', 'filtered'].includes(mode) ? [] : [mentor];
        const filteredMentors = visibleMentors;
        const mentorListHeading = null, strongFitThreshold = 70, query = '', activeCampaignId = 'campaign-1';
        const sourceFilterId = mode === 'filtered' ? '__unlinked__' : '';
        const sourceRecordsById = new Map(), assessmentsByMentor = new Map([['mentor-1', { score: 75, reasonsJson: ['English assessment'] }]]);
        const messagesByMentor = new Map(), mentorEdits = {}, selectedMentor = null;
        const approvalsByMessage = new Map(), selectedTimeline = null;
        const details = { mentors: mode === 'empty' ? [] : [mentor], sourceRecords: [{ id: 'source-1', name: 'Operator source', importedCount: 1000, resultsFound: 1000 }] };
        const mentorPage = { start: 0, end: visibleMentors.length, page: 1, pageCount: 1 };
        const changeMentorPage = () => {}, privacyMode = true, isSensitiveVisible = () => mode === 'revealed';
        const revealSensitive = () => {}, hideSensitive = () => {};
        const mentorForm = { name: 'New <mentor>', company: '', headline: '', bio: '', skills: '', industries: '', location: '', profileUrl: '', notes: 'My draft', sourceRecordId: '' };
        const csvText = 'name,stage\\nAda,new', csvSourceRecordId = '';
        const csvHeaders = ['name', 'stage'];
        const csvColumnMap = Object.fromEntries(csvColumnFields.map(field => [field.key, mode === 'unmapped' ? '' : csvHeaders.includes(field.key) ? field.key : '']));
        const csvFileStatus = { message: 'intake.loaded', details: 'operator<file>.csv' };
        const csvImportResult = { preview: mode !== 'imported', importedCount: 1000, totalRows: 1001,
          skipped: mode === 'imported' ? [] : [{ row: 1001, reason: 'Duplicate <profile>' }] };
        return <Tabs defaultValue="mentors">${tab.getText(source)}</Tabs>;
      }
      export function render(locale, mode = 'normal') {
        return renderToStaticMarkup(<LocaleProvider initialLocale={locale}><Fixture mode={mode} /></LocaleProvider>);
      }
    `,
    resolveDir: process.cwd(), loader: "tsx",
  }, bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic",
});
const context = { module: { exports: {} }, require: createRequire(new URL("../package.json", import.meta.url)), console };
vm.runInNewContext(outputFiles[0].text, context);
const { render } = context.module.exports;
const en = render("en"), nl = render("nl");
for (const [html, labels] of [[en, ['Mentor profiles and fit scores', 'Add and score', 'Column mapping', 'Show mentor notes']], [nl, ['Mentorprofielen en geschiktheid', 'Toevoegen en beoordelen', 'Kolomkoppeling', 'Mentornotities tonen']]]) {
  for (const label of labels) assert.ok(html.includes(label), label);
  assert.match(html, /value="new" selected=""/);
  assert.match(html, /value="follow_up"/);
  assert.match(html, /value="name" selected=""/);
  assert.match(html, /value="stage" selected=""/);
  assert.match(html, /Untranslated &lt;Name&gt;/);
  assert.match(html, /value="Unsaved &lt;notes&gt;"/);
  assert.match(html, /operator&lt;file&gt;\.csv/);
  assert.match(html, /name,stage\nAda,new/);
  assert.match(html, /lang="en"[^>]*>English assessment/);
  assert.match(html, /lang="en">Duplicate &lt;profile&gt;/);
}
assert.match(nl, /lang="nl"/);
assert.match(nl, /Voorbeeld: 1\.000 van 1\.001/);
assert.match(en, /Preview: 1,000 of 1,001/);
assert.match(nl, /aria-label="CSV-bestand"/);
assert.match(nl, /aria-label="CSV-inhoud"/);
assert.match(nl, /aria-label="Mentorfase: Untranslated &lt;Name&gt;"/);
assert.match(nl, /aria-label="Mentornotities: Untranslated &lt;Name&gt;"/);
assert.match(nl, /Bestand ingelezen/);
assert.match(en, /File loaded/);
assert.match(render('nl', 'empty'), /Deze campagne heeft nog geen mentoren/);
assert.match(render('nl', 'filtered'), /Geen mentoren gevonden met deze filters/);
assert.match(render('nl', 'filtered'), /Invoer zonder bronkoppeling/);
assert.match(render('nl', 'blocked'), /Contact toestaan/);
assert.match(render('nl', 'revealed'), /Mentornotities verbergen/);
const unmapped = render('nl', 'unmapped');
assert.match(unmapped, /Koppel een naamkolom voordat je importeert/);
assert.match(unmapped, /disabled="">Importeren/);
assert.match(render('nl', 'imported'), /Geimporteerd: 1\.000 van 1\.001/);
assert.match(render('nl', 'imported'), /Geen dubbele of ongeldige rijen gevonden/);

// File status stores a message key, so a later language switch can rerender it.
const scope = { status: null, result: 'old', text: 'untouched' };
scope.setCsvFileStatus = (value) => { scope.status = value; };
scope.setCsvImportResult = (value) => { scope.result = value; };
scope.setCsvText = (value) => { scope.text = value; };
vm.runInNewContext(ts.transpileModule(`globalThis.read = ${declarations.get("readCsvFile")};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, scope);
await scope.read({ name: 'data.txt', type: 'text/plain', text: () => assert.fail('unsupported file was read') });
assert.equal(scope.status.message, 'intake.unsupported');
assert.equal(scope.text, 'untouched');
await scope.read({ name: 'operator<file>.csv', type: 'text/csv', text: async () => 'name,stage\nAda,new' });
assert.equal(scope.status.message, 'intake.loaded');
assert.equal(scope.status.details, 'operator<file>.csv');
assert.equal(scope.text, 'name,stage\nAda,new');
assert.equal(scope.result, null);
await scope.read({ name: 'unreadable.csv', text: async () => { throw new Error('fixture'); } });
assert.equal(scope.status.message, 'intake.readFailed');
assert.equal(scope.text, 'name,stage\nAda,new');
await scope.read(null);
assert.equal(scope.status, null);
console.log('PASS mentor localization: actual tab in English/Dutch, states, labels, stable status/header values, escaped user text and CSV file handlers');
