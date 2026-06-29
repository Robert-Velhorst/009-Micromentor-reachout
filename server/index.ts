import express from "express";
import { createServer } from "http";
import path from "path";
import { registerLedgerRoutes } from "./ledger";

const serverDir = path.dirname(path.resolve(process.argv[1] || "."));
const appVersion = process.env.MARO_APP_VERSION || process.env.MARO_BUILD_VERSION || "development";

function hostAlias(host: string) {
  return host === "localhost" ? "127.0.0.1" : host;
}

function tunnelTargetsServer(addr: string | undefined, host: string, port: number) {
  if (!addr) return false;
  try {
    const parsed = new URL(addr);
    const tunnelHost = hostAlias(parsed.hostname);
    const expectedHost = hostAlias(host);
    const tunnelPort = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
    return tunnelPort === port && tunnelHost === expectedHost;
  } catch {
    return addr.includes(`:${port}`);
  }
}

async function detectTunnelStatus(host: string, port: number) {
  try {
    const response = await fetch("http://127.0.0.1:4040/api/tunnels", {
      signal: AbortSignal.timeout(750),
    });
    if (!response.ok) {
      throw new Error(`ngrok API returned ${response.status}`);
    }
    const data = await response.json() as {
      tunnels?: Array<{ proto?: string; public_url?: string; config?: { addr?: string } }>;
    };
    const matchingTunnels = (data.tunnels || []).filter((item) => tunnelTargetsServer(item.config?.addr, host, port));
    const tunnel = matchingTunnels.find((item) => item.proto === "https") ?? matchingTunnels[0] ?? null;
    return {
      active: Boolean(tunnel?.public_url),
      publicUrl: tunnel?.public_url ?? null,
      inspectorUrl: "http://127.0.0.1:4040",
      target: tunnel?.config?.addr ?? null,
    };
  } catch {
    return {
      active: false,
      publicUrl: null,
      inspectorUrl: null,
      target: null,
    };
  }
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const isProduction = process.env.NODE_ENV === "production";

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    );
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "img-src 'self' data: blob:",
        "font-src 'self' https://fonts.gstatic.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "script-src 'self'",
        "connect-src 'self'",
      ].join("; ")
    );
    next();
  });

  registerLedgerRoutes(app);

  app.get("/api/runtime/status", async (_req, res) => {
    const port = Number(process.env.PORT || 3000);
    const host = process.env.HOST || "127.0.0.1";
    const tunnel = await detectTunnelStatus(host, port);
    res.json({
      mode: isProduction ? "production" : "development",
      version: appVersion,
      host,
      port,
      localUrl: `http://${host}:${port}`,
      tunnel,
      auth: {
        basicAuthConfigured: Boolean(process.env.NGROK_BASIC_AUTH),
      },
      warnings: tunnel.active && !process.env.NGROK_BASIC_AUTH
        ? ["ngrok_public_without_basic_auth"]
        : [],
    });
  });

  const staticPath = isProduction
    ? path.resolve(serverDir, "public")
    : path.resolve(serverDir, "..", "dist", "public");

  app.use(
    express.static(staticPath, {
      dotfiles: "ignore",
      fallthrough: true,
      maxAge: isProduction ? "1h" : 0,
      setHeaders(res) {
        res.setHeader("Cache-Control", isProduction ? "public, max-age=3600" : "no-store");
      },
    })
  );

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "127.0.0.1";

  server.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}/`);
  });
}

startServer().catch(console.error);
