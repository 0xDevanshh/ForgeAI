import { io, type Socket } from "socket.io-client";

/**
 * One shared connection per tab. The server joins every socket to a
 * `user:<id>` room on connect (see node-backend/src/lib/socket.ts), so a
 * single connection already receives everything for this user — opening one
 * per component would just multiply handshakes.
 */
let socket: Socket | null = null;

export function getSocket(accessToken: string): Socket {
  if (socket?.connected && socket.auth && (socket.auth as { token?: string }).token === accessToken) {
    return socket;
  }

  // The token rotates roughly every 15 minutes; a stale handshake credential
  // would be rejected on the next reconnect, so the old socket is torn down
  // and replaced rather than reused.
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000", {
    // Same JWT as Bearer auth; the server verifies it in a handshake
    // middleware and refuses the connection outright if it's missing/invalid.
    auth: { token: accessToken },
    withCredentials: true,
    transports: ["websocket", "polling"],
  });

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

/**
 * The worker emits per-repo channels (`indexProgress:<repoId>`) rather than one
 * generic event, so subscribing means attaching a listener per repo.
 */
export function indexProgressEvent(repoId: string): string {
  return `indexProgress:${repoId}`;
}

/** Payloads emitted by node-backend/src/workers/indexWorker.ts. */
export type IndexProgressEvent =
  | { status: "CLONING"; progress: number }
  | { status: "PARSING"; progress: number; chunkCount?: number }
  | { status: "EMBEDDING"; progress: number }
  | { status: "COMPLETED"; progress: number; vectorsStored?: number }
  // Note: the failure payload carries no `progress`.
  | { status: "FAILED"; error: string };
