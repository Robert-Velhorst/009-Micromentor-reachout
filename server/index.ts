import express from "express";
import { createServer } from "http";
import path from "path";
import { registerLedgerRoutes } from "./ledger";

const serverDir = path.dirname(path.resolve(process.argv[1] || "."));

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
