"use client";

import * as React from "react";

import {
  apiClient,
  setAccessToken,
  setAccessTokenChangeHandler,
  setSessionExpiredHandler,
} from "@/lib/api-client";
import { disconnectSocket } from "@/lib/socket-client";

export interface AuthUser {
  id: string;
  email: string;
  githubUsername?: string | null;
  createdAt?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  /** True until the initial silent-refresh attempt has resolved either way. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-reads /auth/me — for when a side effect (e.g. linking GitHub) changes
   *  the user server-side and the cached copy would otherwise go stale. */
  refreshUser: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

interface CredentialResponse {
  accessToken: string;
  user: AuthUser;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [token, setToken] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Keeps context state in sync when the interceptor refreshes the token
  // behind the app's back.
  React.useEffect(() => {
    setAccessTokenChangeHandler(setToken);
    setSessionExpiredHandler(() => {
      // Only clears state. Redirecting is the route guard's job — doing it
      // here would also fire for a first-time visitor whose mount refresh
      // 401s simply because they have no cookie yet.
      setToken(null);
      setUser(null);
    });
    return () => {
      setAccessTokenChangeHandler(null);
      setSessionExpiredHandler(null);
    };
  }, []);

  // Restores the session from the httpOnly refresh cookie. Guarded by a ref
  // because refresh tokens rotate on use — React StrictMode's double-invoked
  // effect would otherwise spend the cookie twice and invalidate the session
  // it just restored.
  const bootstrapped = React.useRef(false);

  React.useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    async function restoreSession() {
      try {
        // /auth/refresh returns only { accessToken } — the user has to be
        // fetched separately once the token is in place.
        const refreshed = await apiClient.post<{ accessToken: string }>("/auth/refresh");
        setAccessToken(refreshed.data.accessToken);

        const me = await apiClient.get<{ user: AuthUser }>("/auth/me");
        setUser(me.data.user);
      } catch {
        // No cookie, or it was revoked/expired. Not an error worth surfacing:
        // this is the normal path for anyone who isn't signed in.
        setAccessToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    void restoreSession();

    // Deliberately no cleanup/cancelled flag. StrictMode runs mount → cleanup →
    // mount, so a `cancelled` guard would discard the only bootstrap's result
    // (including setIsLoading(false)) while the ref above blocks the retry —
    // leaving isLoading stuck true and the whole app on a "Loading" screen in
    // dev. The ref already guarantees exactly one run, and this provider lives
    // for the app's lifetime, so there is no real unmount to race with.
  }, []);

  const authenticate = React.useCallback(
    async (path: "/auth/login" | "/auth/signup", email: string, password: string) => {
      const response = await apiClient.post<CredentialResponse>(path, { email, password });
      setAccessToken(response.data.accessToken);
      setUser(response.data.user);
    },
    []
  );

  const login = React.useCallback(
    (email: string, password: string) => authenticate("/auth/login", email, password),
    [authenticate]
  );

  const signup = React.useCallback(
    (email: string, password: string) => authenticate("/auth/signup", email, password),
    [authenticate]
  );

  const refreshUser = React.useCallback(async () => {
    const me = await apiClient.get<{ user: AuthUser }>("/auth/me");
    setUser(me.data.user);
  }, []);

  const logout = React.useCallback(async () => {
    try {
      // Requires the Bearer token, so it has to run before the token is cleared.
      await apiClient.post("/auth/logout");
    } catch {
      // A failed logout still has to clear local state — leaving the user
      // "signed in" on a network blip is worse than an orphaned server row.
    } finally {
      setAccessToken(null);
      setUser(null);
      // The socket authenticated with the now-dead token and is joined to this
      // user's room — it must not outlive the session.
      disconnectSocket();
    }
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({ user, accessToken: token, isLoading, login, signup, logout, refreshUser }),
    [user, token, isLoading, login, signup, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}
