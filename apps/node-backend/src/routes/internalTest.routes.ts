import { Router } from "express";
import { internalHttpClient } from "../lib/internalHttpClient";

// TEMPORARY — exercises the node-backend <-> ai-service internal-auth
// wiring end-to-end (internalHttpClient -> ai-service's verify_internal_key
// -> GET /internal/ping). Used by scripts/smoke-test.sh. Safe to delete
// once a real feature route calls internalHttpClient.
export const internalTestRouter = Router();

internalTestRouter.get("/ping", async (_req, res) => {
  const response = await internalHttpClient.get("/internal/ping");
  res.status(200).json({ node: "ok", aiService: response.data });
});
