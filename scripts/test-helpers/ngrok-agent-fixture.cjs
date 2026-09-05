// A process-boundary fixture, never a real ngrok client or public tunnel.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const mode = process.env.MARO_TEST_AGENT_MODE || "running";
if (process.argv[2] === "version") {
  if (mode === "version-stall") setInterval(() => {}, 1000);
  else process.exit(0);
} else {
  const args = process.argv.slice(2);
  const option = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : null;
  assert.equal(args[0], "http");
  assert.equal(args[1], `http://127.0.0.1:${process.env.PORT}`);
  assert.equal(option("--name"), `maro-${process.env.PORT}-${process.ppid}`);
  assert.equal(option("--url"), process.env.MARO_NGROK_URL || null);
  const policyPath = option("--traffic-policy-file");
  assert.ok(policyPath, "A protected launch must provide its policy file");
  const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
  const action = policy.on_http_request.flatMap((rule) => rule.actions).find((item) => item.type === "basic-auth");
  assert.equal(action.config.enforce, true);
  assert.deepEqual(action.config.credentials, [process.env.NGROK_BASIC_AUTH]);
  process.stdout.write(`MARO_AGENT_FIXTURE ${JSON.stringify({
    name: option("--name"), upstream: { url: args[1] },
    url: option("--url") || "https://owned-fixture.example",
  })}\n`);
  if (mode === "exit") process.exit(7);
  else setInterval(() => {}, 1000);
}
