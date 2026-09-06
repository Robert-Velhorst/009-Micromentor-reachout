import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { getEventListeners } from "node:events";
import vm from "node:vm";
import { transform } from "esbuild";

const source = fs.readFileSync(new URL("../client/src/lib/ledgerApi.ts", import.meta.url), "utf8");
const { code } = await transform(source, { loader: "ts", format: "cjs" });
const settled = (promise) => promise.then(
  (value) => ({ value }),
  (error) => ({ error }),
);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

async function within(promise, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new assert.AssertionError({ message })), 3000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Only the client's clock is controlled. Fetch, response streams and the isolated
// HTTP connection remain real, so aborting must actually unblock the request.
function controlledClock() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    timers,
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, timer] of timers) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
  };
}

let passed = 0;
async function scenario(name, test) {
  const clock = controlledClock();
  const cleanup = new AbortController();
  const requests = [];
  const received = deferred();
  const headersReceived = deferred();
  const fixture = {
    reply: (_request, response) => response.end(JSON.stringify({ projects: [] })),
  };
  const server = http.createServer(async (request, response) => {
    try {
      let body = "";
      for await (const chunk of request) body += chunk;
      requests.push({ url: request.url, method: request.method, headers: request.headers, body });
      fixture.reply(request, response);
      received.resolve();
    } catch (error) {
      response.destroy(error);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = vm.createContext({
    module: { exports: {} }, Headers, AbortController, Error, crypto: globalThis.crypto,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    fetch: async (url, options) => {
      const signal = options.signal
        ? AbortSignal.any([options.signal, cleanup.signal]) : cleanup.signal;
      const response = await fetch(new URL(url, origin), { ...options, signal });
      headersReceived.resolve();
      return response;
    },
  });
  vm.runInContext(code, context, { filename: "ledgerApi.cjs" });
  try {
    await test({
      api: context.module.exports.ledgerApi,
      request: vm.runInContext("request", context),
      fixture, requests, clock,
      received: () => within(received.promise, "The owned server did not receive the request"),
      headersReceived: () => within(headersReceived.promise, "Response headers did not reach the client"),
    });
    assert.equal(clock.timers.size, 0, "Settled requests must release their deadline timers");
    console.log(`PASS client requests: ${name}`);
    passed++;
  } finally {
    cleanup.abort();
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

await scenario("stalled headers time out, coalesced reads settle and a fresh read succeeds", async ({ api, fixture, received, requests, clock }) => {
  fixture.reply = () => {};
  const first = settled(api.projects());
  const second = settled(api.projects());
  await received();
  assert.equal(requests.length, 1, "Concurrent identical reads should use one connection");
  clock.advance(60_000);
  const results = await within(Promise.all([first, second]), "Stalled reads did not settle at their deadline");
  for (const result of results) {
    assert.match(result.error?.message || "", /too long|timed out/i);
    assert.doesNotMatch(result.error.message, /already.*saved/i);
  }
  fixture.reply = (_request, response) => response.end('{"projects":[{"id":"after-timeout"}]}');
  const next = await within(api.projects(), "A fresh read remained stuck behind the expired request");
  assert.equal(next.projects[0].id, "after-timeout");
  assert.equal(requests.length, 2);
});

await scenario("a stalled response body is covered by the same deadline", async ({ api, fixture, received, headersReceived, clock }) => {
  let sendHeaders;
  fixture.reply = (_request, response) => {
    sendHeaders = () => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.write('{"projects":');
    };
  };
  const pending = settled(api.projects());
  await received();
  clock.advance(30_000);
  sendHeaders();
  await headersReceived();
  clock.advance(30_000);
  const result = await within(pending, "Reading the stalled response body did not time out");
  assert.match(result.error?.message || "", /too long|timed out/i);
});

await scenario("an unacknowledged write is not retried and warns that it may have been saved", async ({ api, fixture, received, requests, clock }) => {
  fixture.reply = () => {};
  const first = settled(api.createProject({ title: "Network fixture" }));
  const second = settled(api.createProject({ title: "Network fixture" }));
  await received();
  clock.advance(60_000);
  assert.equal(clock.timers.size, 1, "Writes must retain their longer transfer window");
  clock.advance(60_000);
  const results = await within(Promise.all([first, second]), "Stalled writes did not settle at their deadline");
  for (const result of results) {
    assert.match(result.error?.message || "", /already.*saved/i);
    assert.match(result.error.message, /refresh.*before.*try/i);
  }
  assert.equal(requests.length, 1, "A write with an unknown outcome must not be resent automatically");
  assert.equal(requests[0].headers["x-maro-request"], "1");
  assert.ok(requests[0].headers["idempotency-key"]);
  assert.equal(requests[0].body, '{"title":"Network fixture"}');
});

for (const method of ["GET", "POST", "PATCH"]) {
  await scenario(`${method} connection loss has actionable, outcome-aware feedback`, async ({ request, fixture, requests }) => {
    fixture.reply = (incoming) => incoming.socket.destroy();
    const result = await within(settled(request("/api/projects", { method })), "Connection loss did not settle");
    assert.match(result.error?.message || "", /connection/i);
    if (method !== "GET") {
      assert.match(result.error.message, /already.*saved/i);
      assert.match(result.error.message, /refresh.*before.*try/i);
    } else {
      assert.doesNotMatch(result.error.message, /already.*saved/i);
    }
    assert.equal(requests.length, 1, "The client must not automatically retry transport failures");
  });
}

for (const fixtureCase of [
  { status: 400, body: '{"error":"A project title is required"}', message: /A project title is required/, uncertain: false },
  { status: 409, body: '{"error":"This draft is not approved"}', message: /This draft is not approved/, uncertain: false },
  { status: 500, body: '{"error":"Storage is unavailable"}', message: /Storage is unavailable/, uncertain: true },
  { status: 502, body: "<html>Bad gateway</html>", message: /502/, uncertain: true },
  { status: 200, body: "<html>Unexpected gateway page</html>", message: /invalid API response/i, uncertain: true },
  { status: 200, body: "", message: /empty API response/i, uncertain: true },
]) {
  await scenario(`${fixtureCase.status} ${fixtureCase.body ? "response" : "empty response"} preserves useful errors and write uncertainty`, async ({ api, fixture }) => {
    fixture.reply = (_request, response) => {
      response.statusCode = fixtureCase.status;
      response.end(fixtureCase.body);
    };
    const result = await within(settled(api.createProject({ title: "Response fixture" })), "Error response did not settle");
    assert.match(result.error?.message || "", fixtureCase.message);
    if (fixtureCase.uncertain) assert.match(result.error.message, /already.*saved/i);
    else assert.doesNotMatch(result.error.message, /already.*saved/i);
  });
}

await scenario("a healthy mutation returns its data and releases its in-flight entry", async ({ api, fixture, requests }) => {
  fixture.reply = (_request, response) => response.end('{"project":{"id":"healthy","title":"First"}}');
  const result = await within(api.createProject({ title: "First" }), "Healthy write did not complete");
  assert.equal(result.project.id, "healthy");
  assert.equal(result.project.title, "First");
  await within(api.createProject({ title: "First" }), "The settled write was incorrectly retained");
  assert.equal(requests.length, 2);
  assert.notEqual(requests[0].headers["idempotency-key"], requests[1].headers["idempotency-key"]);
});

await scenario("caller cancellation survives the deadline wrapper", async ({ request, fixture, received }) => {
  fixture.reply = () => {};
  const controller = new AbortController();
  const pending = settled(request("/api/projects", { method: "POST", signal: controller.signal }));
  await received();
  controller.abort();
  const result = await within(pending, "Caller cancellation did not stop the request");
  assert.match(result.error?.message || "", /cancel/i);
  assert.match(result.error.message, /already.*saved/i);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

await scenario("an already cancelled request does not reach the server", async ({ request, requests }) => {
  const controller = new AbortController();
  controller.abort();
  const result = await within(settled(request("/api/projects", { signal: controller.signal })), "Pre-cancelled request did not settle");
  assert.match(result.error?.message || "", /cancel/i);
  assert.equal(requests.length, 0);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

await scenario("successful requests remove the caller cancellation listener", async ({ request }) => {
  const controller = new AbortController();
  await within(request("/api/projects", { signal: controller.signal }), "Healthy read did not complete");
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

await scenario("a slow write can finish after the read deadline without losing its response", async ({ api, fixture, headersReceived, clock }) => {
  let finish;
  fixture.reply = (_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.write('{"project":{"id":"slow-write",');
    finish = () => response.end('"title":"Slow"}}');
  };
  const pending = api.createProject({ title: "Slow" });
  await headersReceived();
  clock.advance(60_000);
  finish();
  const result = await within(pending, "A slow but timely write could not complete");
  assert.equal(result.project.id, "slow-write");
  assert.equal(result.project.title, "Slow");
});

for (const [method, deadline] of [["GET", 60_000], ["HEAD", 60_000], ["POST", 120_000], ["PATCH", 120_000], ["DELETE", 120_000]]) {
  await scenario(`${method} remains pending until its deadline and then rejects`, async ({ request, fixture, received, clock }) => {
    fixture.reply = () => {};
    let finished = false;
    const pending = settled(request("/api/projects", { method })).then((result) => {
      finished = true;
      return result;
    });
    await received();
    clock.advance(deadline - 1);
    await new Promise(setImmediate);
    assert.equal(finished, false, "The client must not cut off requests before their transfer window ends");
    clock.advance(1);
    const result = await within(pending, `${method} did not stop at its deadline`);
    assert.match(result.error?.message || "", /too long|timed out/i);
    if (method === "GET" || method === "HEAD") assert.doesNotMatch(result.error.message, /already.*saved/i);
    else assert.match(result.error.message, /already.*saved/i);
  });
}

for (const operation of ["updateWorkspaceSettings", "restoreWorkspace", "resetWorkspace"]) {
for (const writeFails of [false, true]) {
  await scenario(`settings reads after ${operation} (${writeFails ? "failed" : "successful"}) do not reuse older in-flight reads`, async ({ api, fixture, requests }) => {
    let oldResponse;
    let releaseWrite;
    const patchStarted = deferred();
    const oldReadArrived = deferred();
    let locale = "en";
    fixture.reply = (request, response) => {
      if (request.method !== "GET") {
        releaseWrite = () => {
          locale = "nl";
          if (writeFails) response.destroy();
          else response.end(JSON.stringify({ settings: { locale } }));
        };
        patchStarted.resolve();
      } else if (!oldResponse) {
        oldResponse = response;
        oldReadArrived.resolve();
      } else {
        response.end(JSON.stringify({ settings: { locale } }));
      }
    };
    const writing = settled(api[operation](operation === "updateWorkspaceSettings" ? { locale: "nl" } : operation === "resetWorkspace" ? "workspace" : "{}"));
    await within(patchStarted.promise, "Settings write did not arrive");
    const oldRead = settled(api.workspaceSettings());
    const coalescedRead = settled(api.workspaceSettings());
    // Wait for the specific GET, not the earlier PATCH receipt.
    await within(oldReadArrived.promise, "Old settings read did not arrive");
    releaseWrite();
    const writeResult = await within(writing, "Settings write did not settle");
    assert.equal(Boolean(writeResult.error), writeFails);
    try {
      const fresh = await within(api.workspaceSettings(), "A post-write read reused stale in-flight settings");
      assert.equal(fresh.settings.locale, "nl");
      assert.equal(requests.filter((request) => request.method === "GET").length, 2);
    } finally {
      oldResponse.end('{"settings":{"locale":"en"}}');
      assert.equal((await oldRead).value?.settings.locale, "en");
      assert.equal((await coalescedRead).value?.settings.locale, "en");
    }
  });
}
}

console.log(`PASS client request suite: ${passed} isolated HTTP scenarios; no provider requests or operator data`);
