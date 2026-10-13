import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { build } from "esbuild";

const home = ts.createSourceFile("Home.tsx", fs.readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const reviewHelpers = [];
ts.forEachChild(home, node => { if (ts.isFunctionDeclaration(node) && ['ReviewColumn', 'SensitiveText'].includes(node.name?.text)) reviewHelpers.push(node.getText(home)); });
assert.equal(reviewHelpers.length, 2);
const { outputFiles } = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
  import React from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { LocaleProvider, useTranslation } from './client/src/lib/locale';
  import { Eye, EyeOff, ExternalLink, Copy, ClipboardCheck, Download } from 'lucide-react';
  import { Card, CardHeader, CardTitle, CardContent } from './client/src/components/ui/card';
  import { Button as RealButton } from './client/src/components/ui/button';
  import { Badge } from './client/src/components/ui/badge';
  import { Input } from './client/src/components/ui/input';
  import { Textarea } from './client/src/components/ui/textarea';
  import { UncertainDeliveryControl } from './client/src/components/UncertainDeliveryControl';
  let reviewButtons = [];
  const Button = props => { reviewButtons.push({name: React.Children.toArray(props.children).filter(value => typeof value === 'string').join('').trim(), disabled: Boolean(props.disabled)}); return <RealButton {...props}/>; };
  const MessageQualityBox = () => null;
  ${reviewHelpers.join('\n')}
  export function renderReview(blocked, privacyMode = false, visible = true) {
    reviewButtons = [];
    const message = {id:'message-1',mentorProfileId:'mentor-1',status:'approved',subject:'Approved subject',body:'Approved body'};
    const html = renderToStaticMarkup(<LocaleProvider initialLocale="nl"><ReviewColumn title="Review" messages={[message]} blockedMentorIds={new Set(blocked ? ['mentor-1'] : [])}
      details={{mentors:[{id:'mentor-1',name:'Synthetic mentor',profileUrl:'https://example.com/profile'}],sendAttempts:[{id:'attempt-1',messageDraftId:'message-1',status:'failed',errorMessage:'PRIVATE VERIFICATION NOTE'}]}} draftEdits={{}} onDraftEdit={() => {}}
      qualityByMessage={new Map()} handoffStatus={{}} handoffFallback={{'message-1':'STALE APPROVED FALLBACK'}} privacyMode={privacyMode}
      isSensitiveVisible={() => visible} onRevealSensitive={() => {}} onHideSensitive={() => {}} onCopyDraft={() => {}} onCopyExtensionHandoff={() => {}} onOpenProfile={() => {}} action={() => null}/></LocaleProvider>);
    return {html, buttons: reviewButtons};
  }
  export function render(locale, resolving, privacyMode, paused = false) {
    return renderToStaticMarkup(<LocaleProvider initialLocale={locale}><UncertainDeliveryControl
      resolving={resolving} privacyMode={privacyMode} paused={paused} context="PRIVATE <context>"
      revision={{}} onSubmit={async () => {}} onRefresh={async () => {}} /></LocaleProvider>);
  }
` }, bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic" });
const moduleContext = { module: { exports: {} }, require: createRequire(new URL("../package.json", import.meta.url)), console };
vm.runInNewContext(outputFiles[0].text, moduleContext);
const { render } = moduleContext.module.exports;
for (const blocked of [false, true]) {
  const result = moduleContext.module.exports.renderReview(blocked);
  for (const label of ['Goedgekeurd bericht kopieren', 'Kopieren voor extensie']) assert.equal(result.buttons.find(button => button.name === label)?.disabled, blocked);
  assert.equal(result.buttons.find(button => button.name === 'Profiel openen')?.disabled, false, 'Operator must still be able to inspect the platform');
  assert.equal(result.html.includes('STALE APPROVED FALLBACK'), !blocked);
  assert.equal(result.html.includes('De verzending naar deze mentoridentiteit is nog onzeker'), blocked);
}
assert.doesNotMatch(moduleContext.module.exports.renderReview(false, true, false).html, /PRIVATE VERIFICATION NOTE/, 'Failed resolution must not expose verification notes in privacy mode');
assert.doesNotMatch(moduleContext.module.exports.renderReview(false, true, false).html, /STALE APPROVED FALLBACK/, 'Hiding a draft must also hide any clipboard fallback');
assert.match(moduleContext.module.exports.renderReview(false, true, true).html, /PRIVATE VERIFICATION NOTE/);
assert.match(moduleContext.module.exports.renderReview(false, false, false).html, /PRIVATE VERIFICATION NOTE/);
for (const locale of ["en", "nl"]) {
  for (const resolving of [true, false]) {
    const hidden = render(locale, resolving, true);
    assert.doesNotMatch(hidden, /PRIVATE/);
    assert.match(hidden, /type="password"/);
    assert.match(hidden, /disabled=""/);
    assert.match(render(locale, resolving, false), /PRIVATE &lt;context&gt;/);
    assert.equal(hidden.includes('type="checkbox"'), resolving);
  }
  assert.match(render(locale, true, true, true), /value="confirmed_sent" disabled=""/);
  assert.match(render(locale, true, true), /value="failed"/);
}
assert.match(render("nl", true, true), /Gecontroleerde uitkomst/);
assert.match(render("nl", true, true), /Ik heb het platform gecontroleerd/);
assert.match(render("nl", false, true), /Onzekere verzending vastleggen/);

// Execute the component's actual submission closure with controlled state/transport.
const source = ts.createSourceFile("UncertainDeliveryControl.tsx", fs.readFileSync(new URL("../client/src/components/UncertainDeliveryControl.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && ["blocked", "submit"].includes(node.name.getText(source))) declarations.set(node.name.getText(source), node.initializer.getText(source));
  ts.forEachChild(node, visit);
}
visit(source);
assert.equal(declarations.size, 2);
const handler = ts.transpileModule(`const blocked = ${declarations.get("blocked")}; const submit = ${declarations.get("submit")}; ({ blocked, submit });`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function fixture(overrides = {}) {
  const calls = [];
  const scope = { resolving: true, disabled: false, paused: false, pending: false, needsRefresh: false, note: "  checked proof  ", checked: true, resolution: "confirmed_sent", pendingRef: { current: false }, error: "", Error, ...overrides };
  for (const field of ['Pending', 'NeedsRefresh', 'Note', 'Checked', 'Resolution', 'Error']) scope['set' + field] = value => { scope[field[0].toLowerCase() + field.slice(1)] = value; };
  scope.onSubmit = overrides.onSubmit || (async (...args) => calls.push(args));
  return { scope, calls, ...vm.runInNewContext(handler, scope) };
}
for (const override of [{note:' '}, {disabled:true}, {pending:true}, {needsRefresh:true}, {checked:false}, {resolution:''}, {paused:true}]) {
  const f = fixture(override);
  assert.equal(f.blocked, true);
  await f.submit();
  assert.equal(f.calls.length, 0);
}
for (const [overrides, expected] of [[{}, ['confirmed_sent','checked proof']], [{resolution:'failed',paused:true}, ['failed','checked proof']], [{resolving:false,checked:false,resolution:''}, ['uncertain','checked proof']]]) {
  const f = fixture(overrides);
  await f.submit();
  assert.deepEqual(f.calls, [expected]);
  assert.equal(f.scope.note, '');
  assert.equal(f.scope.checked, false);
  assert.equal(f.scope.pendingRef.current, false);
}
{
  let finish, count = 0;
  const f = fixture({onSubmit: async () => { count++; await new Promise(resolve => { finish = resolve; }); }});
  const pending = f.submit();
  await f.submit();
  assert.equal(count, 1, 'Rapid repeat clicks must not submit twice');
  finish(); await pending;
  assert.equal(f.scope.pending, false);
}
{
  const f = fixture({onSubmit: async () => { throw new Error('acknowledgement lost'); }});
  await f.submit();
  assert.equal(f.scope.note, '  checked proof  ', 'Failure must retain operator evidence');
  assert.equal(f.scope.needsRefresh, true);
  assert.equal(f.scope.error, 'acknowledgement lost');
  assert.equal(f.scope.pending, false);
  assert.equal(f.scope.pendingRef.current, false);
  const rerender = fixture({...f.scope, onSubmit: async () => assert.fail('Unreconciled retry')});
  await rerender.submit();
  assert.equal(rerender.blocked, true);
}
console.log('PASS delivery controls: EN/NL rendering, hidden context, verification/evidence/pause guards, exact commands, repeat-click suppression and uncertain acknowledgement requiring refresh with retained notes');
