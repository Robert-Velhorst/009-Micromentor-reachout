import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const popupPath = path.join(root, "browser-extension", "popup.js");

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    Object.assign(this, init);
  }
}

class FakeInputEvent extends FakeEvent {}

class FakeElement {
  constructor({ tagName = "INPUT", name = "", id = "", placeholder = "" } = {}) {
    this.tagName = tagName;
    this.name = name;
    this.id = id;
    this.placeholder = placeholder;
    this.disabled = false;
    this.readOnly = false;
    this.isContentEditable = false;
    this.labels = [];
    this.style = { display: "block", visibility: "visible" };
    this.events = [];
    this.listeners = new Map();
    this.classList = { toggle() {} };
    this.value = "";
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  async trigger(type) {
    await this.listeners.get(type)?.();
  }

  dispatchEvent(event) {
    this.events.push(event);
    return true;
  }

  focus() {}

  getAttribute(name) {
    if (name === "aria-label") return null;
    return null;
  }

  getBoundingClientRect() {
    return { width: 360, height: 120 };
  }
}

class FakeTextArea extends FakeElement {
  constructor(options = {}) {
    super({ ...options, tagName: "TEXTAREA" });
    this._value = "";
  }

  get value() {
    return this._value;
  }

  set value(value) {
    this._value = value;
  }
}

class FakeInput extends FakeElement {
  constructor(options = {}) {
    super({ ...options, tagName: "INPUT" });
    this._value = "";
  }

  get value() {
    return this._value;
  }

  set value(value) {
    this._value = value;
  }
}

function createPopupDocument() {
  const popupElements = new Map([
    ["handoff", new FakeTextArea({ id: "handoff" })],
    ["fill", new FakeElement({ tagName: "BUTTON", id: "fill" })],
    ["clear", new FakeElement({ tagName: "BUTTON", id: "clear" })],
    ["recipient", new FakeElement({ tagName: "DIV", id: "recipient" })],
    ["status", new FakeElement({ tagName: "DIV", id: "status" })],
  ]);
  return {
    getElementById(id) {
      return popupElements.get(id);
    },
  };
}

function createPageDocument({ bodyFields = [], subjectFields = [], hasFlutterCanvas = false }) {
  return {
    querySelector(selector) {
      return selector === "flt-glass-pane" && hasFlutterCanvas ? {} : null;
    },
    querySelectorAll(selector) {
      if (selector === 'input:not([type]), input[type="text"]') return subjectFields;
      if (selector === 'textarea, [contenteditable="true"][role="textbox"]') return bodyFields;
      return [];
    },
  };
}

function loadPopupFunctions(options = {}) {
  const source = fs.readFileSync(popupPath, "utf8");
  const popupDocument = createPopupDocument();
  const executions = [];
  const clipboard = [];
  let now = Date.now();
  class Clock extends Date {
    static now() { return now; }
  }
  const context = vm.createContext({
    Date: Clock,
    Error,
    Event: FakeEvent,
    HTMLInputElement: FakeInput,
    HTMLTextAreaElement: FakeTextArea,
    InputEvent: FakeInputEvent,
    URL,
    document: popupDocument,
    chrome: {
      tabs: {
        async query() {
          now += options.queryDelay || 0;
          return [{ id: 7, url: options.tabUrl || "https://app.micromentor.org/profile/invite/mentor-123" }];
        },
      },
      scripting: {
        async executeScript(request) {
          executions.push(request);
          now += options.executionDelay || 0;
          return [{ result: options.executionResult || { filledBody: true, filledSubject: false } }];
        },
      },
    },
    navigator: { clipboard: { async writeText(value) { clipboard.push(value); } } },
    window: {
      location: { href: options.pageUrl || "https://app.micromentor.org/profile/invite/mentor-123" },
      getComputedStyle(element) {
        return element.style;
      },
    },
  });
  new vm.Script(
    `${source}\nglobalThis.__maroFillApprovedDraft = fillApprovedDraft;\nglobalThis.__maroComparableProfileUrl = comparableProfileUrl;`,
  ).runInContext(context);
  return {
    executions,
    clipboard,
    element(id) { return popupDocument.getElementById(id); },
    advanceTime(milliseconds) { now += milliseconds; },
    async paste(payload = {}) {
      popupDocument.getElementById("handoff").value = JSON.stringify({
        kind: "maro-manual-handoff", version: 1,
        messageDraftId: "draft-1", mentorProfileId: "mentor-123", mentorName: "Test Mentor",
        profileUrl: "https://app.micromentor.org/profile/mentor-123",
        subject: "Approved subject", body: "Approved message body",
        approvedAt: new Date(now).toISOString(), expiresAt: new Date(now + 600000).toISOString(),
        ...payload,
      });
      await popupDocument.getElementById("handoff").trigger("input");
    },
    comparableProfileUrl(value) {
      return context.__maroComparableProfileUrl(value);
    },
    fillApprovedDraft(subject, body, pageDocument) {
      context.document = pageDocument;
      return context.__maroFillApprovedDraft(subject, body, {
        profile: "app.micromentor.org/profile/mentor-123",
        expiresAt: options.injectedExpiry || new Date(now + 600000).toISOString(),
      });
    },
  };
}

const { comparableProfileUrl, fillApprovedDraft } = loadPopupFunctions();

const canonicalAppProfile = "https://app.micromentor.org/profile/mentor-123";
const activeAppInvite = "https://app.micromentor.org/profile/invite/mentor-123?targetOffersHelp=true";
assert.equal(
  comparableProfileUrl(activeAppInvite),
  comparableProfileUrl(canonicalAppProfile),
  "The active MicroMentor invite route should match its approved canonical profile",
);
assert.notEqual(
  comparableProfileUrl("https://app.micromentor.org/profile/invite/mentor-456"),
  comparableProfileUrl(canonicalAppProfile),
  "A request form for another mentor must remain blocked",
);
assert.throws(
  () => comparableProfileUrl("https://app.micromentor.org/profile//mentor-123"),
  /supported MicroMentor mentor profile/,
  "Malformed app profile routes must be rejected",
);
assert.equal(
  comparableProfileUrl("https://classic.micromentor.org/mentors/ada-tester"),
  "classic.micromentor.org/mentors/ada-tester",
  "The legacy MicroMentor profile comparison should remain unchanged",
);
for (const nonProfileRoute of [
  "https://app.micromentor.org/home",
  "https://app.micromentor.org/explore",
  "https://app.micromentor.org/inbox/chats",
  "https://app.micromentor.org/myProfile",
  "https://app.micromentor.org/accountSettings",
]) {
  assert.throws(
    () => comparableProfileUrl(nonProfileRoute),
    /supported MicroMentor mentor profile/,
    `${nonProfileRoute} must not be eligible for manual handoff filling`,
  );
}

const dormantFlutterResult = fillApprovedDraft(
  "Approved subject",
  "Approved message body",
  createPageDocument({ hasFlutterCanvas: true }),
);
assert.equal(
  dormantFlutterResult.needsFocusedFlutterEditor,
  true,
  "Flutter pages without an activated editor should instruct the operator to focus the message field",
);
assert.equal(dormantFlutterResult.filledBody, false, "A dormant Flutter page must not claim that it filled the message");

const flutterEditor = new FakeTextArea();
const focusedFlutterResult = fillApprovedDraft(
  "Approved subject",
  "Approved message body",
  createPageDocument({ bodyFields: [flutterEditor], hasFlutterCanvas: true }),
);
assert.equal(focusedFlutterResult.filledBody, true, "An activated Flutter editor should receive the approved body");
assert.equal(focusedFlutterResult.filledSubject, false, "MicroMentor's request form should not require a subject field");
assert.equal(flutterEditor.value, "Approved message body", "The approved body should populate the active Flutter editor");
assert.deepEqual(
  flutterEditor.events.map((event) => event.type),
  ["input", "change"],
  "Filling the Flutter editor should emit input and change events",
);

const validPopup = loadPopupFunctions();
await validPopup.paste();
assert.equal(validPopup.element("fill").disabled, false);
await validPopup.element("fill").trigger("click");
assert.equal(validPopup.executions.length, 1, "The real popup handler must request one injection");
assert.equal(validPopup.executions[0].target.tabId, 7);
assert.equal(validPopup.executions[0].args[1], "Approved message body");
assert.match(validPopup.element("status").textContent, /Message filled/);

for (const options of [
  { pageUrl: "https://app.micromentor.org/profile/another-mentor" },
  { pageUrl: "https://app.micromentor.org/inbox/chats" },
  { pageUrl: "https://app.micromentor.org:8443/profile/mentor-123" },
  { injectedExpiry: "2000-01-01T00:00:00.000Z" },
]) {
  const guardedPopup = loadPopupFunctions(options);
  const untouchedEditor = new FakeTextArea();
  untouchedEditor.value = "Existing draft";
  const guardedResult = guardedPopup.fillApprovedDraft("Subject", "New body", createPageDocument({ bodyFields: [untouchedEditor] }));
  assert.equal(guardedResult.filledBody, false, "The injected code must stop after destination drift or package expiry");
  assert.ok(guardedResult.blockedReason);
  assert.equal(untouchedEditor.value, "Existing draft");
}

const blockedInjection = loadPopupFunctions({ executionResult: { filledBody: false, blockedReason: "Destination changed" } });
await blockedInjection.paste();
await blockedInjection.element("fill").trigger("click");
assert.equal(blockedInjection.clipboard.length, 0, "A blocked injection must not offer stale text through fallback");
assert.match(blockedInjection.element("status").textContent, /Destination changed/);

const wrongRecipient = loadPopupFunctions({ tabUrl: "https://app.micromentor.org/profile/another-mentor" });
await wrongRecipient.paste();
await wrongRecipient.element("fill").trigger("click");
assert.equal(wrongRecipient.executions.length, 0, "Another recipient must never receive an injection");
assert.match(wrongRecipient.element("status").textContent, /does not match/);

const dormantPopup = loadPopupFunctions({ executionResult: { filledBody: false, needsFocusedFlutterEditor: true } });
await dormantPopup.paste();
await dormantPopup.element("fill").trigger("click");
assert.equal(dormantPopup.clipboard.length, 1);
assert.match(dormantPopup.element("status").textContent, /activated first/);

for (const queryDelay of [0, 600001]) {
  const expiredPopup = loadPopupFunctions({ queryDelay });
  await expiredPopup.paste();
  if (!queryDelay) expiredPopup.advanceTime(600001);
  await expiredPopup.element("fill").trigger("click");
  assert.equal(expiredPopup.executions.length, 0, "A package expiring after paste or during tab lookup must not be injected");
  assert.equal(expiredPopup.clipboard.length, 0, "Expired content must not be copied as a fallback");
  assert.equal(expiredPopup.element("fill").disabled, true);
  assert.match(expiredPopup.element("status").textContent, /expired/);
}

const clearedPopup = loadPopupFunctions();
await clearedPopup.paste();
await clearedPopup.element("clear").trigger("click");
await clearedPopup.element("fill").trigger("click");
assert.equal(clearedPopup.executions.length, 0);
assert.equal(clearedPopup.element("handoff").value, "");

const expiredFallback = loadPopupFunctions({
  executionDelay: 600001,
  executionResult: { filledBody: false, needsFocusedFlutterEditor: true },
});
await expiredFallback.paste();
await expiredFallback.element("fill").trigger("click");
assert.equal(expiredFallback.clipboard.length, 0, "A package expiring while the browser is busy must not be copied");
assert.match(expiredFallback.element("status").textContent, /expired/);

console.log("Manual handoff extension checks passed (routes, editor, popup, expiry, fallback, clear).");
