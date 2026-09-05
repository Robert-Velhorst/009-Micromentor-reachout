import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 3000);
const host = "127.0.0.1";
const ngrokCommand = "ngrok";
const basicAuth = process.env.NGROK_BASIC_AUTH;
const allowPublicTunnel = process.env.MARO_ALLOW_PUBLIC_TUNNEL === "1";
const configuredEndpointUrl = process.env.MARO_NGROK_URL;
let policyPath = null;
const shutdownController = new AbortController();
const ownedChildren = new Map();
const endpointName = `maro-${port}-${process.pid}`;
const allowedHostsPath = path.join(os.tmpdir(), `maro-allowed-hosts-${process.pid}-${randomUUID()}.json`);
const ownedConfigurationFiles = new Set();
const reportedCleanupFailures = new Set();

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...options.env },
    shell: false,
    stdio: options.stdio ?? "inherit",
    windowsHide: true,
  });
  ownedChildren.set(child, new Promise((resolve) => child.once("close", resolve)));
  child.on("error", (error) => shutdownController.abort(error));
  if (!options.probe) {
    child.once("exit", (code, signal) => {
      shutdownController.abort(new Error(`${options.label || command} exited (${signal || code}).`));
    });
  }
  return child;
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const signal = shutdownController.signal;
    const finish = (error) => {
      clearTimeout(timer);
      child.removeListener("message", ready);
      signal.removeEventListener("abort", aborted);
      if (error) reject(error);
      else resolve();
    };
    const ready = (message) => {
      if (message?.type === "maro-ready" && message.pid === child.pid && message.host === host && message.port === port) finish();
    };
    const aborted = () => finish(signal.reason);
    const timer = setTimeout(() => finish(new Error("MARO did not confirm startup within 15 seconds.")), 15_000);
    child.on("message", ready);
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
  });
}

function tunnelTargetsLocalServer(value) {
  try {
    const target = new URL(value);
    const targetHost = target.hostname === "localhost" ? "127.0.0.1" : target.hostname;
    return target.protocol === "http:" && !target.username && !target.password && target.pathname === "/" && !target.search && !target.hash && targetHost === host && Number(target.port || 80) === port;
  } catch {
    return false;
  }
}

function readInspector(inspectorUrl, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    let response;
    let settled = false;
    const chunks = [];
    const finish = (error, data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", aborted);
      request.destroy();
      response?.destroy();
      chunks.length = 0;
      if (error) reject(error);
      else resolve(data);
    };
    const request = http.get(`${inspectorUrl}/api/endpoints`, { agent: false }, (incoming) => {
      response = incoming;
      if (response.statusCode !== 200) { finish(new Error("Inspector did not return JSON data.")); return; }
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("error", (error) => finish(error));
      response.once("aborted", () => finish(new Error("Inspector response was interrupted.")));
      response.once("end", () => {
        try { finish(null, JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch (error) { finish(error); }
      });
    });
    const aborted = () => finish(signal.reason);
    const timer = setTimeout(() => finish(new Error("Inspector request timed out.")), timeoutMs);
    request.once("error", (error) => finish(error));
    signal.addEventListener("abort", aborted, { once: true });
  });
}

async function waitForTunnel() {
  const signal = shutdownController.signal;
  const deadline = performance.now() + 15_000;
  while (!signal.aborted && performance.now() < deadline) {
    for (let inspectorPort = 4040; inspectorPort <= 4050; inspectorPort += 1) {
      const remaining = deadline - performance.now();
      if (signal.aborted || remaining <= 0) break;
      try {
        const inspectorUrl = `http://127.0.0.1:${inspectorPort}`;
        const data = await readInspector(inspectorUrl, signal, Math.min(300, remaining));
        const found = (Array.isArray(data.endpoints) ? data.endpoints : []).find((item) => item?.name === endpointName && tunnelTargetsLocalServer(item.upstream?.url));
        const publicEndpoint = found?.url ? validatedEndpointUrl(found.url) : null;
        if (publicEndpoint && (!endpoint || publicEndpoint.origin === endpoint.origin)) {
          signal.throwIfAborted();
          return { publicUrl: publicEndpoint.origin, inspectorUrl };
        }
      } catch {
        // ngrok chooses the next available local inspector port.
      }
    }

    const remaining = deadline - performance.now();
    if (remaining <= 0) break;
    try { await delay(Math.min(500, remaining), undefined, { signal }); } catch { break; }
  }

  return null;
}

function validatedBasicAuth(value) {
  if (!value) return null;
  if (/\r|\n/.test(value)) throw new Error("NGROK_BASIC_AUTH cannot contain line breaks.");
  const separator = value.indexOf(":");
  const username = separator > 0 ? value.slice(0, separator) : "";
  const password = separator > 0 ? value.slice(separator + 1) : "";
  if (!username || password.length < 8 || password.length > 128) {
    throw new Error("NGROK_BASIC_AUTH must use user:password with an 8-128 character password.");
  }
  return value;
}

function validatedEndpointUrl(value) {
  if (!value) return null;
  const endpoint = new URL(value);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.pathname !== "/" || endpoint.search || endpoint.hash) {
    throw new Error("MARO_NGROK_URL must be an HTTPS origin without credentials, a path, query, or fragment.");
  }
  return endpoint;
}

function writePrivateConfiguration(destination, content) {
  // Register ownership only after exclusive creation succeeds, before any write.
  const descriptor = fs.openSync(destination, "wx", 0o600);
  ownedConfigurationFiles.add(destination);
  try { fs.writeFileSync(descriptor, content, "utf8"); }
  finally { fs.closeSync(descriptor); }
}

function removeOwnedConfiguration(file) {
  if (!ownedConfigurationFiles.has(file)) return;
  fs.rmSync(file, { force: true });
  ownedConfigurationFiles.delete(file);
}

function cleanupConfiguration() {
  for (const file of ownedConfigurationFiles) {
    try { removeOwnedConfiguration(file); }
    catch (error) {
      process.exitCode = 1;
      if (!reportedCleanupFailures.has(file)) {
        console.error(`Cannot remove temporary tunnel configuration: ${file} (${error.code || "I/O failure"}). Remove this file before sharing the machine.`);
        reportedCleanupFailures.add(file);
      }
    }
  }
}

function createTrafficPolicy(credentials) {
  const destination = path.join(os.tmpdir(), `maro-ngrok-policy-${process.pid}-${randomUUID()}.json`);
  const policy = {
    on_http_request: [
      {
        actions: [
          {
            type: "basic-auth",
            config: { credentials: [credentials], enforce: true, realm: "MARO" },
          },
        ],
      },
    ],
  };
  writePrivateConfiguration(destination, JSON.stringify(policy));
  return destination;
}

function removeTrafficPolicy() {
  if (!policyPath) return;
  removeOwnedConfiguration(policyPath);
  policyPath = null;
}

function writeAllowedHosts(hosts) {
  const normalized = [...new Set(hosts.filter(Boolean).map((hostValue) => String(hostValue).toLowerCase()))];
  const temporary = `${allowedHostsPath}.tmp-${randomUUID()}`;
  writePrivateConfiguration(temporary, JSON.stringify({ hosts: normalized }));
  fs.renameSync(temporary, allowedHostsPath);
  ownedConfigurationFiles.delete(temporary);
  ownedConfigurationFiles.add(allowedHostsPath);
}

async function ensureNgrokAvailable() {
  return new Promise((resolve) => {
    const child = run(ngrokCommand, ["version"], { stdio: "ignore", probe: true });
    const signal = shutdownController.signal;
    const aborted = () => finish(false);
    const timer = setTimeout(() => finish(false), 5000);
    const finish = (available) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", aborted);
      resolve(available);
    };
    child.once("error", () => finish(false));
    child.once("exit", (code) => finish(code === 0));
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
  });
}

async function stopOwnedChildren() {
  for (const child of ownedChildren.keys()) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
  let timer;
  try {
    await Promise.race([
      Promise.all(ownedChildren.values()),
      new Promise((resolve) => {
        timer = setTimeout(() => {
          for (const child of ownedChildren.keys()) {
            if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
          }
          resolve();
        }, 3000);
      }),
    ]);
  } finally { clearTimeout(timer); }
  await Promise.all(ownedChildren.values());
}

if (!basicAuth && !allowPublicTunnel) {
  console.error("Refusing to open an unauthenticated public ngrok tunnel.");
  console.error("Set NGROK_BASIC_AUTH=user:password, or set MARO_ALLOW_PUBLIC_TUNNEL=1 only when public access is intentional.");
  process.exit(1);
}

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error("PORT must be an integer between 1 and 65535.");
  process.exit(1);
}

let protectedCredentials = null;
let endpoint = null;
try {
  protectedCredentials = validatedBasicAuth(basicAuth);
  endpoint = validatedEndpointUrl(configuredEndpointUrl);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

let interrupted = false;
function interrupt() {
  interrupted = true;
  shutdownController.abort(new Error("Launcher stopped."));
}
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);
process.once("exit", cleanupConfiguration);

try {
  if (!await ensureNgrokAvailable()) throw new Error("ngrok is unavailable or its version check timed out. Install and authenticate ngrok, then try again.");
  shutdownController.signal.throwIfAborted();
  writeAllowedHosts([]);
  const server = run(process.execPath, ["dist/index.cjs"], {
    label: "Local MARO server",
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: {
      NODE_ENV: "production", HOST: host, PORT: String(port),
      MARO_ALLOWED_HOSTS: process.env.MARO_ALLOWED_HOSTS || "",
      MARO_ALLOWED_HOSTS_FILE: allowedHostsPath,
    },
  });
  server.stdout.on("data", (chunk) => process.stdout.write(chunk));
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));
  await waitForServer(server);
  shutdownController.signal.throwIfAborted();

  const ngrokArgs = ["http", `http://${host}:${port}`, "--name", endpointName];
  if (endpoint) ngrokArgs.push("--url", endpoint.origin);
  if (protectedCredentials) {
    policyPath = createTrafficPolicy(protectedCredentials);
    ngrokArgs.push("--traffic-policy-file", policyPath);
  } else {
    console.warn("Warning: MARO_ALLOW_PUBLIC_TUNNEL=1 explicitly allows this tunnel to be public without basic auth.");
  }
  const ngrok = run(ngrokCommand, ngrokArgs, { label: "ngrok", stdio: ["ignore", "pipe", "pipe"] });
  ngrok.stdout.on("data", (chunk) => process.stdout.write(chunk));
  ngrok.stderr.on("data", (chunk) => process.stderr.write(chunk));
  const tunnel = await waitForTunnel();
  shutdownController.signal.throwIfAborted();
  if (!tunnel) throw new Error("ngrok did not expose a matching HTTPS endpoint within 15 seconds. Check the ngrok output above.");
  removeTrafficPolicy();
  writeAllowedHosts([new URL(tunnel.publicUrl).hostname]);
  console.log(`ngrok tunnel ready: ${tunnel.publicUrl}`);
  console.log(`ngrok inspector: ${tunnel.inspectorUrl}`);
  await new Promise((resolve) => {
    if (shutdownController.signal.aborted) resolve();
    else shutdownController.signal.addEventListener("abort", resolve, { once: true });
  });
  shutdownController.signal.throwIfAborted();
} catch (error) {
  if (!interrupted) console.error(error.message);
  process.exitCode = interrupted ? 0 : 1;
} finally {
  shutdownController.abort();
  await stopOwnedChildren();
  cleanupConfiguration();
}
