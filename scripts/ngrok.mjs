import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 3000);
const host = "127.0.0.1";
const ngrokCommand = "ngrok";
const basicAuth = process.env.NGROK_BASIC_AUTH;
const allowPublicTunnel = process.env.MARO_ALLOW_PUBLIC_TUNNEL === "1";

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

async function waitForTunnelUrl() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:4040/api/tunnels");
      const data = await response.json();
      const tunnel = data.tunnels?.find((item) => item.proto === "https") ?? data.tunnels?.[0];
      if (tunnel?.public_url) {
        return tunnel.public_url;
      }
    } catch {
      // ngrok exposes the local tunnel API after startup.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return null;
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

const available = await ensureNgrokAvailable();
if (!available) {
  console.error("ngrok is not installed or is not available on PATH.");
  console.error("Install ngrok, authenticate it with your ngrok account, then run npm run dev again.");
  process.exit(1);
}

const server = run(process.execPath, ["dist/index.cjs"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { NODE_ENV: "production", HOST: host, PORT: String(port) },
});

server.stdout.on("data", (chunk) => process.stdout.write(chunk));
server.stderr.on("data", (chunk) => process.stderr.write(chunk));

await waitForServer();

const ngrokArgs = ["http", `http://${host}:${port}`];
if (basicAuth) {
  ngrokArgs.push("--basic-auth", basicAuth);
} else {
  console.warn("Warning: MARO_ALLOW_PUBLIC_TUNNEL=1 explicitly allows this tunnel to be public without basic auth.");
}

const ngrok = run(ngrokCommand, ngrokArgs, {
  stdio: ["ignore", "pipe", "pipe"],
});

ngrok.stdout.on("data", (chunk) => process.stdout.write(chunk));
ngrok.stderr.on("data", (chunk) => process.stderr.write(chunk));

const tunnelUrl = await waitForTunnelUrl();
if (tunnelUrl) {
  console.log(`ngrok tunnel ready: ${tunnelUrl}`);
} else {
  console.log("ngrok started. Open http://127.0.0.1:4040 to inspect the tunnel URL.");
}

function shutdown() {
  ngrok.kill();
  server.kill();
}

server.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Local server exited with ${code}.`);
  }
  ngrok.kill();
});

ngrok.on("exit", (code) => {
  if (code !== 0 && code !== null) {
    console.error(`ngrok exited with ${code}.`);
  }
  server.kill();
});

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});
