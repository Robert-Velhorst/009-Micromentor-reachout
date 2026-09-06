import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";
import fs from "node:fs";
import ts from "typescript";
import { build } from "esbuild";

const require = createRequire(new URL("../package.json", import.meta.url));
const { outputFiles } = await build({
  stdin: {
    contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { LocaleProvider, useTranslation } from './client/src/lib/locale';
      import { MentorPagination } from './client/src/components/MentorPagination';
      import { LanguageSelect } from './client/src/components/LanguageSelect';
      import { WorkspaceNotice } from './client/src/components/WorkspaceNotice';
      import { messages } from './client/src/lib/messages';
      export { messages };
      function Probe() {
        const { t } = useTranslation();
        return <div>{t('workspace.restoreConfirm')}</div>;
      }
      export function render(locale) {
        return renderToStaticMarkup(<LocaleProvider initialLocale={locale}>
          <Probe />
          <WorkspaceNotice notice={{ message: 'workspace.exported' }} />
          <LanguageSelect onChange={async () => {}} disabled={false} />
          <MentorPagination range={{ start: 0, end: 25, page: 1, pageCount: 40 }} total={1000} onChange={() => {}} />
        </LocaleProvider>);
      }
    `,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  packages: "external",
  jsx: "automatic",
});
const context = { module: { exports: {} }, require, console };
vm.runInNewContext(outputFiles[0].text, context);
const { render, messages } = context.module.exports;
assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.nl).sort());
for (const locale of ["en", "nl"]) {
  for (const [key, value] of Object.entries(messages[locale])) {
    assert.equal(typeof value, "string", `${locale}.${key}`);
    assert.ok(value.trim(), `${locale}.${key} must not be blank`);
  }
}
const english = render("en");
const dutch = render("nl");
assert.match(english, /Previous mentor page/);
assert.match(dutch, /Vorige mentorpagina/);
assert.match(dutch, /Volgende mentorpagina/);
assert.match(dutch, /1\.000/);
assert.match(english, /1,000/);
assert.match(dutch, /huidige lokale werkruimte vervangen/);
assert.match(english, /replace the current local workspace/);
assert.match(dutch, /aria-label="Taal"/);
assert.match(dutch, /value="nl" lang="nl" selected=""/);
assert.match(english, /value="en" lang="en" selected=""/);
assert.doesNotMatch(dutch, /Previous mentor page|Next mentor page/);
assert.match(dutch, /Back-up geexporteerd\./);
assert.doesNotMatch(dutch, /Backup exported\./);
assert.match(english, /Backup exported\./);
console.log(`PASS localization: ${Object.keys(messages.en).length} paired messages, Dutch/English rendered pagination, formatting, language selection and restore warning`);

// Execute the actual Home handlers with only the API and state boundaries replaced.
const homeText = fs.readFileSync(new URL("../client/src/pages/Home.tsx", import.meta.url), "utf8");
const home = ts.createSourceFile("Home.tsx", homeText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = [];
function visit(node) {
  if (ts.isVariableDeclaration(node) && ["loadLedger", "updateLocale", "withLocaleWrite", "restoreWorkspace", "resetWorkspace", "mutate"].includes(node.name.getText(home))) {
    assert.ok(node.initializer && ts.isArrowFunction(node.initializer));
    handlers.push(`const ${node.name.getText(home)} = ${node.initializer.getText(home)};`);
  }
  ts.forEachChild(node, visit);
}
visit(home);
assert.equal(handlers.length, 6);
const handlerCode = ts.transpileModule(handlers.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const read = deferred();
  const write = deferred();
  const events = [];
  const state = { locale: "en", settings: { locale: "en", outreachCooldownDays: 30 } };
  const scope = {
    Error, Promise,
    activeCampaignId: "campaign-qa",
    runtimeStatus: null,
    workspaceBackupText: "{}",
    window: { confirm: () => true },
    t: (key) => key,
    localeRevision: { current: 0 },
    localeWritesPending: { current: 0 },
    ledgerApi: {
      dashboard: async () => { events.push(["dashboard"]); return {}; },
      workspaceSettings: () => read.promise,
      updateWorkspaceSettings: (payload) => { events.push(["patch", JSON.parse(JSON.stringify(payload))]); return write.promise; },
      restoreWorkspace: () => write.promise,
      resetWorkspace: () => write.promise,
    },
    setLocale: (locale) => { state.locale = locale; events.push(["locale", locale]); },
  };
  for (const name of ["setLoading", "setError", "setSummary", "setProjects", "setCampaigns", "setActiveCampaignId", "setDetails", "setHealthStatus", "setRuntimeStatus", "setHaiStatus", "setWorkspaceSettings", "setEnvironmentOutboundPause", "setDraftEdits", "setWorkspaceStatus", "setWorkspacePreview"]) {
    scope[name] = (...args) => events.push([name, ...args]);
  }
  scope.setWorkspaceSettings = (next) => { state.settings = typeof next === "function" ? next(state.settings) : next; };
  const functions = vm.runInNewContext(`${handlerCode}\n({ loadLedger, updateLocale, withLocaleWrite, restoreWorkspace, resetWorkspace })`, scope);
  return { ...functions, scope, events, state, read, write };
}
const settings = (locale) => ({ settings: { locale }, environmentOutboundPause: false });
{
  const f = fixture();
  const saving = f.updateLocale("nl");
  f.state.settings.outreachCooldownDays = 90;
  assert.equal(f.state.locale, "en", "Do not display an unacknowledged preference");
  assert.equal(f.scope.localeWritesPending.current, 1);
  f.write.resolve(settings("nl"));
  await saving;
  assert.equal(f.state.locale, "nl");
  assert.equal(f.state.settings.outreachCooldownDays, 90, "Language acknowledgement must preserve unsaved safety fields");
  assert.equal(f.scope.localeWritesPending.current, 0);
  assert.deepEqual(f.events.filter(([kind]) => kind === "patch"), [["patch", { locale: "nl" }]]);
  assert.ok(!f.events.some(([kind]) => ["dashboard", "setDraftEdits", "setActiveCampaignId"].includes(kind)), "Language changes must not reload the ledger or erase drafts");
}
for (const finishReadFirst of [true, false]) {
  const f = fixture();
  const loading = f.loadLedger();
  const saving = f.updateLocale("nl");
  if (finishReadFirst) {
    f.read.resolve(settings("en"));
    await loading;
    assert.equal(f.events.filter(([kind]) => kind === "locale").length, 0, "Do not apply a read during a pending save");
  }
  f.write.resolve(settings("nl"));
  await saving;
  if (!finishReadFirst) {
    f.read.resolve(settings("en"));
    await loading;
  }
  assert.equal(f.state.locale, "nl", "A stale refresh must not undo the acknowledged language");
}
{
  const f = fixture();
  const saving = f.updateLocale("nl");
  f.write.reject(new Error("lost acknowledgement"));
  await assert.rejects(saving, /lost acknowledgement/);
  assert.equal(f.state.locale, "en");
  assert.equal(f.scope.localeWritesPending.current, 0);
  assert.equal(f.events.filter(([kind]) => kind === "patch").length, 1, "No automatic retry after uncertain write");
  f.read.resolve(settings("nl"));
  await f.loadLedger();
  assert.equal(f.state.locale, "nl", "A later explicit refresh reconciles the saved preference");
}
{
  const f = fixture();
  const second = deferred();
  const firstWrite = f.withLocaleWrite(() => f.write.promise);
  const secondWrite = f.withLocaleWrite(() => second.promise);
  assert.equal(f.scope.localeWritesPending.current, 2);
  f.write.resolve({});
  await firstWrite;
  assert.equal(f.scope.localeWritesPending.current, 1);
  f.read.resolve(settings("nl"));
  await f.loadLedger();
  assert.equal(f.state.locale, "en", "Reads remain blocked until all settings-changing operations finish");
  second.resolve({});
  await secondWrite;
  assert.equal(f.scope.localeWritesPending.current, 0);
}
console.log("PASS localization handlers: acknowledged-only changes, no draft reload, both refresh races, overlapping write tracking, failure cleanup and explicit reconciliation");
for (const operation of ["restoreWorkspace", "resetWorkspace"]) {
  const f = fixture();
  const oldLoading = f.loadLedger();
  const changing = f[operation]("workspace");
  assert.equal(f.scope.localeWritesPending.current, 1, `${operation} must guard older refreshes`);
  f.scope.ledgerApi.workspaceSettings = async () => settings("nl");
  f.write.resolve({ summary: {} });
  await changing;
  assert.equal(f.state.locale, "nl", `${operation} must hydrate the new settings`);
  f.read.resolve(settings("en"));
  await oldLoading;
  assert.equal(f.state.locale, "nl", `A pre-${operation} response must not undo restored settings`);
  assert.equal(f.scope.localeWritesPending.current, 0);
}
console.log("PASS localization recovery: actual restore/reset handlers reload new settings and reject pre-recovery locale responses");
