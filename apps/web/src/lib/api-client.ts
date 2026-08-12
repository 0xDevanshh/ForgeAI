import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

/**
 * The access token lives in this module variable and nowhere else — never
 * localStorage or sessionStorage, which any XSS payload can read. It dies with
 * the tab; the httpOnly refresh cookie is what survives a reload.
 */
let accessToken: string | null = null;

type Listener<T> = (value: T) => void;

let onSessionExpired: Listener<void> | null = null;
let onAccessTokenChange: Listener<string | null> | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  onAccessTokenChange?.(token);
}

/** Called when the refresh cookie is gone or rejected — the session is over. */
export function setSessionExpiredHandler(handler: Listener<void> | null): void {
  onSessionExpired = handler;
}

export function setAccessTokenChangeHandler(handler: Listener<string | null> | null): void {
  onAccessTokenChange = handler;
}

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
  // Required for the httpOnly refresh cookie to travel at all — it is scoped
  // to path=/auth on the API origin.
  withCredentials: true,
  timeout: 30_000,
});

apiClient.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

const REFRESH_PATH = "/auth/refresh";

/**
 * Shared across every request that hits a 401 at the same time. Without this,
 * N concurrent requests would fire N refreshes — and since the server rotates
 * the refresh token on each call, the later rotations would invalidate the
 * earlier ones and kill the session outright.
 */
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = apiClient
      .post<{ accessToken: string }>(REFRESH_PATH)
      .then((response) => {
        const token = response.data.accessToken;
        setAccessToken(token);
        return token;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/** Marks a request as already retried so a failed retry can't loop. */
type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const code = error.response?.data?.code;

    // Only an *expired* access token is refreshable. A 401 without that code
    // means something else — wrong credentials on /auth/login, or no session
    // at all — and refreshing would be pointless or misleading.
    const isRefreshable =
      status === 401 &&
      code === "TOKEN_EXPIRED" &&
      config !== undefined &&
      !config._retried &&
      config.url !== REFRESH_PATH;

    if (!isRefreshable) {
      // A rejected refresh means the cookie is gone or revoked: the session is
      // genuinely over, so tell the app rather than failing silently.
      if (status === 401 && config?.url === REFRESH_PATH) {
        setAccessToken(null);
        onSessionExpired?.();
      }
      return Promise.reject(error);
    }

    config._retried = true;

    try {
      await refreshAccessToken();
    } catch {
      setAccessToken(null);
      onSessionExpired?.();
      return Promise.reject(error);
    }

    return apiClient(config);
  }
);

/** The error envelope every node-backend route returns (see types/http.ts). */
export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: { field: string; message: string }[];
  retryAfter?: number;
}

export interface NormalizedApiError {
  status: number | null;
  message: string;
  code?: string;
  details?: { field: string; message: string }[];
  retryAfter?: number;
}

/**
 * Flattens an unknown thrown value into something a form can branch on, so
 * screens never have to poke at axios internals.
 */
export function normalizeApiError(error: unknown): NormalizedApiError {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    if (error.response) {
      return {
        status: error.response.status,
        message: error.response.data?.error ?? "Something went wrong.",
        code: error.response.data?.code,
        details: error.response.data?.details,
        retryAfter: error.response.data?.retryAfter,
      };
    }
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return { status: null, message: "That request timed out. Try again." };
    }
    return { status: null, message: "We couldn't reach the server. Check your connection." };
  }
  return { status: null, message: "Something went wrong." };
}
