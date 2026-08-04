import axios, { type AxiosError } from "axios";
import { env } from "../config/env";
import { AppError } from "../middleware/errorHandler";
import { getCurrentRequestId } from "./requestContext";

const DEFAULT_TIMEOUT_MS = 30_000;

// Preconfigured axios instance for calling the AI service. The 30s default
// timeout can be overridden per call for long operations (e.g. indexing):
//   internalHttpClient.post("/index", body, { timeout: 5 * 60_000 })
export const internalHttpClient = axios.create({
  baseURL: env.AI_SERVICE_URL,
  timeout: DEFAULT_TIMEOUT_MS,
});

internalHttpClient.interceptors.request.use((config) => {
  config.headers.set("X-Internal-Key", env.INTERNAL_SERVICE_SECRET);

  const requestId = getCurrentRequestId();
  if (requestId) {
    config.headers.set("X-Request-Id", requestId);
  }

  return config;
});

internalHttpClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      // Never forward the ai-service's own error body/message to our
      // caller — only the status code carries through, as a generic error.
      throw new AppError("Internal service request failed", error.response.status);
    }

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      throw new AppError("Internal service request timed out", 504);
    }

    throw new AppError("Internal service is unavailable", 502);
  },
);
