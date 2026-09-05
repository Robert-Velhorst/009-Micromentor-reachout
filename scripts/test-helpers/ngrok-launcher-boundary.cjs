const childProcess = require("node:child_process");
const { syncBuiltinESMExports } = require("node:module");
const path = require("node:path");

// Only the test-owned launcher loads this preload. The real MARO child and all
// child process events remain unchanged; the external ngrok binary is replaced.
if (!process.send || !process.env.MARO_TEST_INSPECTOR_URL || !process.env.MARO_DATA_DIR) {
  throw new Error("Ngrok launcher tests require isolated data, inspector and IPC");
}
const spawn = childProcess.spawn;
childProcess.spawn = function (command, args, options) {
  const isNgrok = command === "ngrok";
  const kind = isNgrok ? (args[0] === "version" ? "version" : "agent") : "server";
  const child = isNgrok
    ? spawn(process.execPath, [path.join(__dirname, "ngrok-agent-fixture.cjs"), ...args], options)
    : spawn(command, ["--expose-gc", "--require", path.join(__dirname, "ngrok-inspector-boundary.cjs"), ...args], options);
  const policyIndex = args.indexOf("--traffic-policy-file");
  process.send({
    type: "launcher-child", kind, pid: child.pid,
    allowedHostsPath: options.env?.MARO_ALLOWED_HOSTS_FILE,
    policyPath: policyIndex >= 0 ? args[policyIndex + 1] : null,
  });
  child.once("close", () => process.send?.({ type: "launcher-child-closed", kind, pid: child.pid }, () => {}));
  return child;
};
syncBuiltinESMExports();
process.on("message", (message) => {
  if (message?.type === "launcher-test-stop") process.emit("SIGTERM");
});
process.channel.unref();

require("./ngrok-inspector-boundary.cjs");
if (process.env.MARO_TEST_CONFIG_FAULT) require("./ngrok-config-faults.cjs");
