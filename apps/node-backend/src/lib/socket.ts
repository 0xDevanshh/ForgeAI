import type { Server as HttpServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import { Redis } from "ioredis";
import { Server, type Socket } from "socket.io";
import { env } from "../config/env";
import { verifyAccessToken } from "../services/token.service";
import { logger } from "./logger";

let io: Server | undefined;
let pubClient: Redis | undefined;
let subClient: Redis | undefined;

function userRoom(userId: string): string {
  return `user:${userId}`;
}

// Clients authenticate on connect with their access token (socket.handshake
// auth.token) — same JWT already used for Bearer auth on regular requests
// (see middleware/authenticate.ts). An invalid/missing token is rejected at
// the handshake itself (via next(new Error(...))), which refuses the
// connection outright rather than accepting then disconnecting. On success
// the socket is joined to a per-user room so events can target "everything
// this user has open" without tracking individual socket ids.
//
// Backed by the Redis adapter (a dedicated pub/sub pair of ioredis
// connections, separate from both the generic caching client and BullMQ's
// own connection) so emitToUser() reaches a client even when the process
// handling that client's WebSocket connection isn't the same process that
// calls emitToUser — e.g. this worker, if it's ever split out to run as its
// own process instead of alongside the Express app.
export function initSocketServer(httpServer: HttpServer): Server {
  pubClient = new Redis(env.REDIS_URL);
  subClient = pubClient.duplicate();

  pubClient.on("error", (err) => logger.error({ err }, "Socket.IO Redis pub client error"));
  subClient.on("error", (err) => logger.error({ err }, "Socket.IO Redis sub client error"));

  io = new Server(httpServer, {
    cors: {
      origin: env.ALLOWED_ORIGINS,
      credentials: true,
    },
    adapter: createAdapter(pubClient, subClient),
  });

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      next(new Error("Missing auth token"));
      return;
    }

    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error("Invalid or expired auth token"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId as string;
    void socket.join(userRoom(userId));
    logger.info({ userId, socketId: socket.id }, "Socket connected, joined user room");

    socket.on("disconnect", () => {
      logger.info({ userId, socketId: socket.id }, "Socket disconnected");
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error("Socket.IO server has not been initialized — call initSocketServer() first");
  }
  return io;
}

// The one thing other parts of the app (like the BullMQ worker) should use
// to reach a user — callers never need direct Socket.IO server access, and
// don't need to know rooms are how this is implemented under the hood.
export function emitToUser(userId: string, event: string, data: unknown): void {
  getIO().to(userRoom(userId)).emit(event, data);
}

export async function closeSocketServer(): Promise<void> {
  if (io) {
    await io.close();
  }
  await Promise.all([pubClient?.quit(), subClient?.quit()]);
}
