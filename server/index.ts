import express, { type ErrorRequestHandler, type Request } from "express";
import { createServer } from "http";
import { createHash, randomUUID } from "node:crypto";
import path from "path";
import { registerLedgerRoutes } from "./ledger";

const serverDir = path.dirname(path.resolve(process.argv[1] || "."));
const appVersion = process.env.MARO_APP_VERSION || process.env.MARO_BUILD_VERSION || "development";
const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
const ngrokHostSuffixes = [".ngrok.app", ".ngrok-free.app", ".ngrok.io"];
const requestBuckets = new Map<string, { windowStartedAt: number; count: number }>();
const idempotencyCache = new Map<string, { expiresAt: number; status: number; body: unknown; bodyHash: string }>();

function hostAlias(host: string) {
  return host === "localhost" ? "127.0.0.1" : host;
}

function requestHostname(value: string | undefined) {
  const host = String(value || "").split(",", 1)[0].trim();
  if (!host) return "";
  try {
    const hostname = new URL(`http://${host}`).hostname.toLowerCase();
    return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  } catch {
    return "";
  }
}

function configuredAllowedHosts() {
  return new Set(
    String(process.env.MARO_ALLOWED_HOSTS || "")
      .split(",")
      .map((host) => requestHostname(host))
      .filter(Boolean)
  );
}

function hostIsAllowed(req: Request) {
  const hostname = requestHostname(req.get("host"));
  if (!hostname) return false;
  if (localHosts.has(hostname) || configuredAllowedHosts().has(hostname)) return true;

  const tunnelEnabled = Boolean(process.env.NGROK_BASIC_AUTH) || process.env.MARO_ALLOW_PUBLIC_TUNNEL === "1";
  return tunnelEnabled && ngrokHostSuffixes.some((suffix) => hostname.endsWith(suffix));
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
  for (let inspectorPort = 4040; inspectorPort <= 4050; inspectorPort += 1) {
    try {
      const inspectorUrl = `http://127.0.0.1:${inspectorPort}`;
      const response = await fetch(`${inspectorUrl}/api/endpoints`, {
        signal: AbortSignal.timeout(300),
      });
      if (!response.ok) continue;
      const data = await response.json() as {
        endpoints?: Array<{ url?: string; upstream?: { url?: string } }>;
      };
      const endpoint = (data.endpoints || []).find((item) => tunnelTargetsServer(item.upstream?.url, host, port));
      if (endpoint?.url) {
        return {
          active: true,
          publicUrl: endpoint.url,
          inspectorUrl,
          target: endpoint.upstream?.url ?? null,
        };
      }
    } catch {
      // ngrok chooses another local inspector port when an earlier one is occupied.
    }
  }

  return {
    active: false,
    publicUrl: null,
    inspectorUrl: null,
    target: null,
  };
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const isProduction = process.env.NODE_ENV === "production";

  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
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
        "font-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        "connect-src 'self'",
      ].join("; ")
    );
    next();
  });

  app.use((req, res, next) => {
    if (!hostIsAllowed(req)) {
      res.status(421).json({ error: "Request host is not allowed" });
      return;
    }
    next();
  });

  app.use("/api", (req, res, next) => {
    const key = req.socket.remoteAddress || "local";
    const current = Date.now();
    const bucket = requestBuckets.get(key);
    const active = bucket && current - bucket.windowStartedAt < 60_000
      ? bucket
      : { windowStartedAt: current, count: 0 };
    active.count += 1;
    requestBuckets.set(key, active);
    res.setHeader("RateLimit-Limit", "300");
    res.setHeader("RateLimit-Remaining", String(Math.max(0, 300 - active.count)));
    if (active.count > 300) {
      res.setHeader("Retry-After", "60");
      res.status(429).json({ error: "API rate limit exceeded", code: "rate_limited", requestId: res.locals.requestId, retryable: true });
      return;
    }
    next();
  });

  const mutationMethods = new Set(["POST", "PATCH", "PUT", "DELETE"]);
  app.use("/api", (req, res, next) => {
    if (!mutationMethods.has(req.method.toUpperCase())) {
      next();
      return;
    }

    if (req.get("Sec-Fetch-Site") === "cross-site") {
      res.status(403).json({ error: "Cross-site mutation requests are not allowed" });
      return;
    }

    if (req.get("X-MARO-Request") !== "1") {
      res.status(403).json({ error: "Mutation request header is required" });
      return;
    }

    next();
  });

  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "1mb", type: "application/json" }));

  app.use("/api", (req, res, next) => {
    if (!mutationMethods.has(req.method.toUpperCase())) return next();
    const suppliedKey = String(req.get("Idempotency-Key") || "").trim();
    if (!suppliedKey) return next();
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(suppliedKey)) {
      res.status(400).json({ error: "Invalid Idempotency-Key", code: "invalid_idempotency_key", requestId: res.locals.requestId, retryable: false });
      return;
    }
    const bodyHash = createHash("sha256").update(JSON.stringify(req.body || null)).digest("hex");
    const cacheKey = `${req.method}:${req.path}:${suppliedKey}`;
    const cached = idempotencyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      if (cached.bodyHash !== bodyHash) {
        res.status(409).json({ error: "Idempotency-Key was already used with different content", code: "idempotency_conflict", requestId: res.locals.requestId, retryable: false });
        return;
      }
      res.setHeader("X-Idempotent-Replay", "1");
      res.status(cached.status).json(cached.body);
      return;
    }
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (res.statusCode < 500) {
        idempotencyCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60_000, status: res.statusCode, body, bodyHash });
        if (idempotencyCache.size > 1000) {
          idempotencyCache.forEach((value, key) => {
            if (value.expiresAt <= Date.now()) idempotencyCache.delete(key);
          });
        }
      }
      return originalJson(body);
    }) as typeof res.json;
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
        publicTunnelExplicitlyAllowed: process.env.MARO_ALLOW_PUBLIC_TUNNEL === "1",
      },
      warnings: tunnel.active && !process.env.NGROK_BASIC_AUTH
        ? ["ngrok_public_without_basic_auth"]
        : [],
    });
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found", code: "not_found", requestId: res.locals.requestId, retryable: false });
  });

  const apiErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
    if (!req.path.startsWith("/api")) {
      next(error);
      return;
    }

    const status = typeof error?.status === "number" ? error.status : 500;
    const message = status === 413
      ? "Request body is too large"
      : status === 400
        ? "Request body must be valid JSON"
        : "Internal API error";
    if (status >= 500) console.error(error);
    res.status(status).json({ error: message, code: status === 413 ? "payload_too_large" : status === 400 ? "invalid_json" : "internal_error", requestId: res.locals.requestId, retryable: status >= 500 });
  };
  app.use(apiErrorHandler);

  const staticPath = isProduction
    ? path.resolve(serverDir, "public")
    : path.resolve(serverDir, "..", "dist", "public");

  app.use(
    express.static(staticPath, {
      dotfiles: "ignore",
      fallthrough: true,
      maxAge: 0,
      setHeaders(res, filePath) {
        if (!isProduction) {
          res.setHeader("Cache-Control", "no-store");
          return;
        }
        const filename = path.basename(filePath);
        const fingerprintedAsset = /-[A-Za-z0-9_-]{8,}\.(?:css|js|mjs|png|jpe?g|gif|svg|webp|woff2?)$/i.test(filename);
        res.setHeader(
          "Cache-Control",
          fingerprintedAsset ? "public, max-age=31536000, immutable" : "no-cache"
        );
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
