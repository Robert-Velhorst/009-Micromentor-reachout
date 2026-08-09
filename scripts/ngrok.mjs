import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 3000);
const host = "127.0.0.1";
const ngrokCommand = "ngrok";
const basicAuth = process.env.NGROK_BASIC_AUTH;
const allowPublicTunnel = process.env.MARO_ALLOW_PUBLIC_TUNNEL === "1";
const configuredEndpointUrl = process.env.MARO_NGROK_URL;
let policyPath = null;
let ngrokExitCode = null;

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...options.env },
    shell: false,
    stdio: options.stdio ?? "inherit",
    windowsHide: true,
  });
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    const tryConnect = () => {
      const socket = net.connect({ host, port });

      socket.on("connect", () => {
        socket.end();
        resolve();
      });

      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - started > 15000) {
          reject(new Error(`Server did not respond on ${host}:${port}`));
          return;
        }
        setTimeout(tryConnect, 300);
      });
    };

    tryConnect();
  });
}

function tunnelTargetsLocalServer(value) {
  try {
    const target = new URL(value);
    const targetHost = target.hostname === "localhost" ? "127.0.0.1" : target.hostname;
    return targetHost === host && Number(target.port || 80) === port;
  } catch {
    return false;
  }
}

async function waitForTunnel() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (ngrokExitCode !== null) return null;
    for (let inspectorPort = 4040; inspectorPort <= 4050; inspectorPort += 1) {
      try {
        const inspectorUrl = `http://127.0.0.1:${inspectorPort}`;
        const response = await fetch(`${inspectorUrl}/api/endpoints`);
        if (!response.ok) continue;
        const data = await response.json();
        const endpoint = (data.endpoints || []).find((item) => tunnelTargetsLocalServer(item.upstream?.url));
        if (endpoint?.url) {
          return { publicUrl: endpoint.url, inspectorUrl };
        }
      } catch {
        // ngrok chooses the next available local inspector port.
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
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
  fs.writeFileSync(destination, JSON.stringify(policy), { encoding: "utf8", mode: 0o600, flag: "wx" });
  return destination;
}

function removeTrafficPolicy() {
  if (!policyPath) return;
  try { fs.rmSync(policyPath, { force: true }); } catch {}
  policyPath = null;
}

async function ensureNgrokAvailable() {
  return new Promise((resolve) => {
    const child = spawn(ngrokCommand, ["version"], {
      cwd: root,
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });

    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
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

const available = await ensureNgrokAvailable();
if (!available) {
  console.error("ngrok is not installed or is not available on PATH.");
  console.error("Install ngrok, authenticate it with your ngrok account, then run npm run dev again.");
  process.exit(1);
}

const server = run(process.execPath, ["dist/index.cjs"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    NODE_ENV: "production",
    HOST: host,
    PORT: String(port),
    MARO_ALLOWED_HOSTS: [process.env.MARO_ALLOWED_HOSTS, endpoint?.hostname].filter(Boolean).join(","),
  },
});

server.stdout.on("data", (chunk) => process.stdout.write(chunk));
server.stderr.on("data", (chunk) => process.stderr.write(chunk));

await waitForServer();

const ngrokArgs = ["http", `http://${host}:${port}`];
if (endpoint) {
  ngrokArgs.push("--url", endpoint.origin);
}
if (protectedCredentials) {
  policyPath = createTrafficPolicy(protectedCredentials);
  ngrokArgs.push("--traffic-policy-file", policyPath);
} else {
  console.warn("Warning: MARO_ALLOW_PUBLIC_TUNNEL=1 explicitly allows this tunnel to be public without basic auth.");
}
ngrokArgs.push("--name", `maro-${port}-${process.pid}`);

const ngrok = run(ngrokCommand, ngrokArgs, {
  stdio: ["ignore", "pipe", "pipe"],
});

ngrok.stdout.on("data", (chunk) => process.stdout.write(chunk));
ngrok.stderr.on("data", (chunk) => process.stderr.write(chunk));

server.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Local server exited with ${code}.`);
  }
  ngrok.kill();
});

ngrok.on("exit", (code) => {
  ngrokExitCode = code;
  removeTrafficPolicy();
  if (code !== 0 && code !== null) {
    console.error(`ngrok exited with ${code}.`);
  }
  server.kill();
});

const tunnel = await waitForTunnel();
removeTrafficPolicy();
if (tunnel) {
  console.log(`ngrok tunnel ready: ${tunnel.publicUrl}`);
  console.log(`ngrok inspector: ${tunnel.inspectorUrl}`);
} else {
  console.error("ngrok did not expose a tunnel for this MARO server. Check the ngrok output above.");
  ngrok.kill();
  server.kill();
  process.exit(1);
}

function shutdown() {
  removeTrafficPolicy();
  ngrok.kill();
  server.kill();
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});
