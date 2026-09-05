if (!process.send || !process.env.MARO_TEST_INSPECTOR_URL || !process.env.MARO_DATA_DIR) {
  throw new Error("Inspector fixtures require isolated data, inspector and IPC");
}
const originalFetch = globalThis.fetch;
function fixtureUrl(url) {
  const target = new URL(url);
  if (target.hostname !== "127.0.0.1" || Number(target.port) < 4040 || Number(target.port) > 4050 || target.pathname !== "/api/endpoints") {
    throw new Error("Test process attempted an unexpected network destination");
  }
  return `${process.env.MARO_TEST_INSPECTOR_URL}/api/endpoints`;
}
globalThis.fetch = (url, options) => {
  const pending = originalFetch(fixtureUrl(url), options);
  if (process.env.MARO_TEST_FORCE_GC === "1") {
    return pending.then((response) => {
      setImmediate(() => globalThis.gc());
      return response;
    });
  }
  return pending;
};
const http = require("node:http");
const originalGet = http.get;
http.get = (url, options, callback) => {
  const request = originalGet(fixtureUrl(url), options, callback);
  if (process.env.MARO_TEST_FORCE_GC === "1") {
    request.once("response", () => setImmediate(() => globalThis.gc()));
  }
  return request;
};
require("node:module").syncBuiltinESMExports();
