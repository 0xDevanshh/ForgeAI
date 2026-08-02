import { Router } from "express";
import { liveness, readiness } from "../controllers/healthController";

export const healthRouter = Router();

healthRouter.get("/live", liveness);
healthRouter.get("/ready", readiness);
