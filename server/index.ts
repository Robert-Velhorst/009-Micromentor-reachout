import express, { type ErrorRequestHandler, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import { createServer } from "http";
import path from "path";
import { registerLedgerRoutes } from "./ledger";

const serverDir = path.dirname(path.resolve(process.argv[1] || "."));
const appVersion = process.env.MARO_APP_VERSION || process.env.MARO_BUILD_VERSION || "development";
const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);

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
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const isProduction = process.env.NODE_ENV === "production";
  const spaFallbackLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  app.disable("x-powered-by");
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

  registerLedgerRoutes(app);

  app.get("/api/runtime/status", (_req, res) => {
    const port = Number(process.env.PORT || 3000);
    const host = process.env.HOST || "127.0.0.1";
    res.json({
      mode: isProduction ? "production" : "development",
      version: appVersion,
      host,
      port,
      localUrl: `http://${host}:${port}`,
    });
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API route not found" });
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
    res.status(status).json({ error: message });
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
  app.get("/{*splat}", spaFallbackLimiter, (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "127.0.0.1";

  server.listen(port, host, () => {
    console.log(`Server running on http://${host}:${port}/`);
  });
}

startServer().catch(console.error);
