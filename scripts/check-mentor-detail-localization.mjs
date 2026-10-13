import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { build } from "esbuild";

const source = ts.createSourceFile("Home.tsx", fs.readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const helpers = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && ["MentorDetailPanel", "RelationshipTimeline", "SensitiveText", "MiniStat"].includes(node.name?.text)) helpers.set(node.name.text, node.getText(source));
  if (ts.isVariableDeclaration(node) && ["formatDate", "timelineTone"].includes(node.name.getText(source))) helpers.set(node.name.getText(source), `const ${node.name.getText(source)} = ${node.initializer.getText(source)};`);
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(helpers.size, 6, "Render actual detail, timeline and privacy components");
const { outputFiles } = await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { Check, ExternalLink, FileText, Eye, EyeOff } from 'lucide-react';
    import { LocaleProvider, useTranslation } from './client/src/lib/locale';
    import { Badge } from './client/src/components/ui/badge';
    import { Button as RealButton } from './client/src/components/ui/button';
    import { Card, CardContent, CardHeader, CardTitle } from './client/src/components/ui/card';
    let buttons = [];
    function Button(props) { buttons.push(props); return <RealButton {...props}/>; }
    const ActionList = ({ actions, emptyText }) => <div>{actions.length ? 'English recommendation' : emptyText}</div>;
    ${[...helpers.values()].join("\n")}
    export function render(locale, mode = 'hidden', overrides = {}) {
      buttons = [];
      const events = [];
      const date = '2026-10-13T08:00:00Z';
      const mentor = { id: 'mentor-1', name: 'Operator <name>', stage: 'approved', source: '', headline: '',
        profileUrl: 'https://example.com/profile', location: 'Arnhem', bio: '', skills: ['Private skill'], industries: ['Energy'], notes: 'SECRET <notes>' };
      const empty = mode === 'empty';
      const props = {
        mentor: mode === 'unselected' ? null : mentor,
        sourceRecord: { name: 'Source <name>' },
        assessment: empty ? null : { score: 75.5, reasonsJson: ['English rationale'], risksJson: ['English risk'] },
        messages: empty ? [] : [{ id: 'draft-1', subject: 'Subject <unchanged>', updatedAt: date, status: 'approved' }],
        approvalsByMessage: new Map([['draft-1', [{ decision: 'approved', decisionReason: 'Reason <unchanged>' }]]]),
        sendAttempts: empty ? [] : [{ messageDraftId: 'draft-1', deliveryEvidence: 'SECRET <proof>', status: 'confirmed_sent' }],
        responses: empty ? [] : [{ id: 'response-1', classification: 'more_info', body: 'SECRET <response>' }],
        followUps: empty ? [] : [{ id: 'follow-1', status: 'scheduled', dueAt: date, suggestedMessage: 'SECRET <follow-up>' }],
        outcomes: empty ? [] : [{ id: 'outcome-1', status: 'booked', summary: 'Summary <unchanged>' }],
        timeline: { entries: empty ? [] : [{ id: 'event-1', label: 'Response', tone: 'success', title: 'English title', detail: 'English detail', occurredAt: date,
          sensitiveKey: 'timeline-response:response-1', sensitiveText: 'SECRET <timeline>', sensitivePlaceholder: 'Response text hidden' }] },
        nextActions: empty ? [] : [{ type: 'review_duplicate_profile' }],
        auditEvents: empty ? [] : [{ action: 'created_profile', riskLevel: 'low' }],
        privacyMode: mode !== 'privacyOff', isSensitiveVisible: () => mode === 'revealed',
        onRevealSensitive: key => events.push(['reveal', key]), onHideSensitive: key => events.push(['hide', key]),
        onCreateDraft: value => events.push(['draft', value === mentor, value.id]),
        onResolveDuplicate: value => events.push(['duplicate', value === mentor, value.id]),
        ...overrides,
      };
      const before = JSON.stringify(props);
      const html = renderToStaticMarkup(<LocaleProvider initialLocale={locale}><MentorDetailPanel {...props}/></LocaleProvider>);
      for (const button of buttons) button.onClick?.();
      return { html, events, unchanged: before === JSON.stringify(props) };
    }
  ` }, bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic",
});
const context = { module: { exports: {} }, require: createRequire(new URL("../package.json", import.meta.url)), console };
vm.runInNewContext(outputFiles[0].text, context);
const { render } = context.module.exports;
for (const locale of ["en", "nl"]) {
  const hidden = render(locale);
  assert.ok(hidden.unchanged, "Presentation must not mutate input records");
  assert.doesNotMatch(hidden.html, /SECRET/, "Private text must not appear anywhere in hidden markup");
  for (const text of ['Operator &lt;name&gt;', 'Subject &lt;unchanged&gt;', 'Reason &lt;unchanged&gt;', 'Summary &lt;unchanged&gt;']) assert.ok(hidden.html.includes(text));
  assert.match(hidden.html, /href="https:\/\/example.com\/profile" target="_blank" rel="noreferrer"/);
  assert.match(hidden.html, /lang="en"[^>]*>English rationale/);
  assert.match(hidden.html, /lang="en"[^>]*>English detail/);
  const events = JSON.parse(JSON.stringify(hidden.events));
  assert.ok(events.some(e => JSON.stringify(e) === JSON.stringify(['draft', true, 'mentor-1'])));
  assert.ok(events.some(e => JSON.stringify(e) === JSON.stringify(['duplicate', true, 'mentor-1'])));
  const privacyKeys = ['timeline-response:response-1', 'send-proof:draft-1', 'detail-response:response-1', 'detail-follow-up:follow-1', 'detail-notes:mentor-1'];
  assert.deepEqual(events.filter(e => e[0] === 'reveal').map(e => e[1]).sort(), [...privacyKeys].sort());
  for (const mode of ['revealed', 'privacyOff']) {
    const result = render(locale, mode);
    for (const suffix of ['notes', 'proof', 'response', 'follow-up', 'timeline']) assert.ok(result.html.includes('SECRET &lt;' + suffix + '&gt;'));
    assert.ok(result.unchanged);
    assert.equal(result.events.filter(e => e[0] === 'reveal').length, 0);
    assert.equal(result.events.filter(e => e[0] === 'hide').length, mode === 'revealed' ? 5 : 0);
  }
  const expectedDate = new Intl.DateTimeFormat(locale === 'nl' ? 'nl-NL' : 'en-GB', { month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' }).format(new Date('2026-10-13T08:00:00Z'));
  assert.ok(hidden.html.includes(expectedDate));
  const mixedAttempts = render(locale, 'hidden', {sendAttempts: ['failed', 'uncertain', 'confirmed_sent'].map((status, index) => ({id: 'attempt-' + index, messageDraftId: 'draft-1', status, deliveryEvidence: ''}))});
  assert.ok(mixedAttempts.html.includes(locale === 'nl' ? 'Verzendpogingen' : 'Send attempts'), 'Attempt count must not imply confirmed sends');
  assert.match(mixedAttempts.html, />3<\/div>/, 'All attempt outcomes remain counted');
}
const dutch = render('nl').html;
for (const label of ['Mentordetails', 'Contacttijdlijn', 'Onderbouwing geschiktheid', 'Verzendbewijs verborgen', 'Reactietekst verborgen', 'Interne notities verborgen', 'Tonen', 'Meer informatie', 'Gepland', 'Ingepland', 'Goedgekeurd', '75,5%']) assert.ok(dutch.includes(label), label);
assert.doesNotMatch(dutch, />Reveal<|>Hide<|Mentor detail|Fit reasoning/);
assert.match(render('nl', 'revealed').html, /Verbergen/);
for (const label of ['Geen directe actie', 'Nog geen onderbouwing', 'Nog geen berichtconcepten', 'Nog geen reacties', 'Nog geen contactgebeurtenissen']) assert.ok(render('nl', 'empty').html.includes(label), label);
assert.match(render('nl', 'unselected').html, /Selecteer een mentor/);
assert.match(render('en', 'unselected').html, /Select a mentor/);
for (const [group, statuses, make] of [
  ['draft', ['draft','approved','rejected','sent'], status => ({messages:[{id:'draft-1',subject:'Status test',updatedAt:'2026-10-13T08:00:00Z',status}]})],
  ['response', ['interested','not_interested','more_info','unavailable','unknown'], classification => ({responses:[{id:'r',classification,body:''}]})],
  ['follow-up', ['scheduled','completed','cancelled'], status => ({followUps:[{id:'f',status,dueAt:'2026-10-13T08:00:00Z',suggestedMessage:''}]})],
  ['outcome', ['open','booked','helpful','declined','no_response','not_relevant','closed'], status => ({outcomes:[{id:'o',status,summary:'Status test'}]})],
]) {
  for (const status of statuses) {
    const result = render('nl', 'revealed', make(status));
    assert.ok(result.unchanged, group + ' ' + status);
    assert.doesNotMatch(result.html, /undefined/);
  }
}
console.log('PASS mentor detail localization: actual detail/timeline/privacy components, EN/NL labels and dates, unchanged escaped records, hidden secrets and exact reveal/hide/draft/duplicate callbacks');
