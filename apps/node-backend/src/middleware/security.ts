import compression from "compression";
import cors, { type CorsOptionsDelegate } from "cors";
import type { Express } from "express";
import helmet from "helmet";
import { env } from "../config/env";
import { AppError } from "./errorHandler";

const corsOptionsDelegate: CorsOptionsDelegate = (req, callback) => {
  const origin = req.headers.origin;

  // No Origin header means a non-browser client (curl, server-to-server, health
  // checks) — allow it through since the wildcard/browser-origin check doesn't apply.
  if (!origin || env.ALLOWED_ORIGINS.includes(origin)) {
    // credentials: true is required for the browser to send/receive the
    // httpOnly refresh-token cookie across origins (web app vs. this API).
    callback(null, { origin: true, credentials: true });
    return;
  }

  callback(new AppError(`Origin "${origin}" is not allowed by CORS policy`, 403), { origin: false });
};

export function applySecurityMiddleware(app: Express): void {
  app.use(helmet());
  app.use(cors(corsOptionsDelegate));
  app.use(compression());
}
