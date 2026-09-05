const fs = require("node:fs");
const { Server } = require("node:http");
const path = require("node:path");

// Loaded only by the isolated storage test through Node's --require option.
if (!process.send || !process.env.MARO_DATA_DIR) throw new Error("Storage faults require an isolated IPC test child");
const listen = Server.prototype.listen;
Server.prototype.listen = function (...args) {
  this.once("listening", () => process.send({ type: "storage-test-listening", address: this.address() }));
  return listen.apply(this, args);
};
const ledger = path.join(process.env.MARO_DATA_DIR, "maro-ledger.json");
const handles = new Map();
let armed;
let primaryCommitted = false;
const original = Object.fromEntries(["openSync", "writeFileSync", "fsyncSync", "closeSync", "renameSync", "statSync"].map((name) => [name, fs[name].bind(fs)]));
function target(file) {
  if (typeof file !== "string" || !file.endsWith(".tmp")) return null;
  if (file.startsWith(`${ledger}.backup.`)) return "backup";
  if (file.startsWith(`${ledger}.`)) return "primary";
  return null;
}
function fault(stage, destination) {
  if (!destination || armed?.stage !== stage || armed.target !== destination) return null;
  const { code, id } = armed;
  armed = null;
  // Deliberately deliver after HTTP can finish; the runner must await IPC.
  setTimeout(() => process.send({ type: "storage-fault-fired", id, stage, target: destination }), 50);
  return Object.assign(new Error(`Injected ${code} during ${destination} ${stage}`), { code });
}
process.on("message", (message) => {
  if (message?.type !== "arm-storage-fault") return;
  if (!["open", "write", "sync", "close", "rename", "cache-stat"].includes(message.stage) || !["primary", "backup"].includes(message.target)) {
    throw new Error("Invalid storage fault");
  }
  armed = message;
  primaryCommitted = false;
  process.send({ type: "storage-fault-armed", id: message.id });
});
fs.openSync = (file, ...args) => {
  const destination = target(file);
  const error = fault("open", destination);
  if (error) throw error;
  const handle = original.openSync(file, ...args);
  if (destination) handles.set(handle, destination);
  return handle;
};
fs.writeFileSync = (handle, contents, ...args) => {
  const error = fault("write", handles.get(handle));
  if (error) {
    original.writeFileSync(handle, contents.slice(0, Math.floor(contents.length / 2)), ...args);
    throw error;
  }
  return original.writeFileSync(handle, contents, ...args);
};
fs.fsyncSync = (handle) => {
  const error = fault("sync", handles.get(handle));
  if (error) throw error;
  return original.fsyncSync(handle);
};
fs.closeSync = (handle) => {
  const destination = handles.get(handle);
  original.closeSync(handle);
  handles.delete(handle);
  const error = fault("close", destination);
  if (error) throw error;
};
fs.renameSync = (from, to) => {
  const error = fault("rename", target(from));
  if (error) throw error;
  const result = original.renameSync(from, to);
  if (to === ledger) primaryCommitted = true;
  return result;
};
fs.statSync = (file, ...args) => {
  const error = file === ledger && primaryCommitted ? fault("cache-stat", "primary") : null;
  if (error) throw error;
  return original.statSync(file, ...args);
};
