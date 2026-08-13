import { apiClient } from "@/lib/api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Sends the browser to the account-linking flow. This must be a full-page
 * navigation, not an XHR: the endpoint answers with a 302 to GitHub's consent
 * screen, which fetch can't follow cross-origin.
 *
 * The endpoint authenticates the navigation from the httpOnly refresh cookie
 * (see node-backend middleware/authenticateNavigation.ts), since a top-level
 * navigation can't carry the in-memory access token as a header.
 */
export function startGithubConnect(): void {
  window.location.href = `${API_URL}/auth/github/connect`;
}

export async function disconnectGithub(): Promise<void> {
  await apiClient.post("/auth/github/disconnect");
}
