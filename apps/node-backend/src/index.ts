import "dotenv/config";
import cors from "cors";
import express, { type Request, type Response } from "express";
import type { ApiError } from "@ai-codebase-copilot/shared-types";

const app = express();
const port = Number(process.env.NODE_BACKEND_PORT ?? process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "node-backend" });
});

app.use((_req: Request, res: Response) => {
  const error: ApiError = { message: "Not found", code: "NOT_FOUND" };
  res.status(404).json(error);
});

app.listen(port, () => {
  console.log(`node-backend listening on port ${port}`);
});
