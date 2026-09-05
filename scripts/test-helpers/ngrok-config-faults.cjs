const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { syncBuiltinESMExports } = require("node:module");

if (!process.send || !process.env.MARO_DATA_DIR) throw new Error("Configuration faults require an isolated IPC launcher");
const requested = process.env.MARO_TEST_CONFIG_FAULT;
const original = Object.fromEntries(["openSync", "writeFileSync", "closeSync", "renameSync", "rmSync"].map(name => [name, fs[name].bind(fs)]));
const files = new Map();
const handles = new Map();
let hostsFiles = 0;
let fired = false;
function identify(file) {
  if (typeof file === "number") return handles.get(file);
  if (typeof file !== "string" || path.dirname(file) !== os.tmpdir()) return null;
  if (files.has(file)) return files.get(file);
  const base = path.basename(file);
  let phase;
  if (base.startsWith(`maro-ngrok-policy-${process.pid}-`)) phase = "policy";
  else if (base.startsWith(`maro-allowed-hosts-${process.pid}-`) && base.includes(".tmp-")) phase = ++hostsFiles === 1 ? "hosts-initial" : "hosts-publish";
  if (!phase) return null;
  const item = { file, phase };
  files.set(file, item);
  process.send({ type: "launcher-config-file", ...item });
  return item;
}
function fault(stage, item) {
  if (!item || requested !== `${item.phase}-${stage}` || (fired && stage !== "cleanup-persistent")) return null;
  fired = true;
  process.send({ type: "launcher-config-fault", stage, ...item });
  return Object.assign(new Error(`Injected configuration ${item.phase} ${stage}`), { code: stage === "write" ? "ENOSPC" : "EACCES" });
}
fs.openSync = (file, ...args) => {
  const item = identify(file);
  const collision = fault("collision", item);
  if (collision) {
    original.writeFileSync(file, "unowned-collision-sentinel", { flag: "wx" });
  }
  const error = fault("open", item);
  if (error) throw error;
  const descriptor = original.openSync(file, ...args);
  if (item) handles.set(descriptor, item);
  return descriptor;
};
fs.writeFileSync = (file, data, ...args) => {
  const error = fault("write", identify(file));
  if (error) {
    original.writeFileSync(file, data.slice(0, Math.floor(data.length / 2)), ...args);
    throw error;
  }
  return original.writeFileSync(file, data, ...args);
};
fs.closeSync = descriptor => {
  const item = handles.get(descriptor);
  original.closeSync(descriptor);
  handles.delete(descriptor);
  const error = fault("close", item);
  if (error) throw error;
};
fs.renameSync = (from, to) => {
  const error = fault("rename", identify(from));
  if (error) {
    process.send({ type: "launcher-config-previous-hosts", intact: fs.existsSync(to) && fs.readFileSync(to, "utf8") === '{"hosts":[]}' });
    throw error;
  }
  return original.renameSync(from, to);
};
fs.rmSync = (file, ...args) => {
  const item = identify(file);
  const error = fault("cleanup-transient", item) || fault("cleanup-persistent", item);
  if (error) throw error;
  return original.rmSync(file, ...args);
};
syncBuiltinESMExports();
