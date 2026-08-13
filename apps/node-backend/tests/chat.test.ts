import { randomUUID } from "node:crypto";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// emitToUser reaches for a Socket.IO server that is never initialized in
// tests (getIO throws). Mocking the module keeps chatQuery runnable AND makes
// the queryProgress relay assertable, which is otherwise invisible from HTTP.
const emitToUser = vi.fn();
vi.mock("../src/lib/socket", () => ({
  emitToUser: (...args: unknown[]) => emitToUser(...args),
}));

const { app } = await import("../src/app");
const { prisma } = await import("../src/lib/prisma");
const { env } = await import("../src/config/env");

const STRONG_PASSWORD = "Str0ng!Pass1";

/** Builds an SSE body in the exact frame format ai-service's /query emits. */
function sseStream(events: Record<string, unknown>[]): string {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
}

let queryResponse = sseStream([{ node: "done" }]);

const server = setupServer(
  http.post(`${env.AI_SERVICE_URL}/query`, () => {
    return new HttpResponse(queryResponse, {
      headers: { "Content-Type": "text/event-stream" },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
beforeEach(() => {
  emitToUser.mockClear();
});

// These suites run against the shared dev database, so every user this file
// creates is removed at the end. Deleting the user cascades to Repo ->
// ChatSession -> Message (see onDelete: Cascade in schema.prisma).
afterAll(async () => {
  server.close();
  await prisma.user.deleteMany({ where: { email: { startsWith: "chat-test-" } } });
});

function uniqueEmail(label: string): string {
  return `chat-test-${label}-${randomUUID()}@example.com`;
}

async function signupUser(label: string): Promise<{ accessToken: string; userId: string }> {
  const res = await request(app)
    .post("/auth/signup")
    .send({ email: uniqueEmail(label), password: STRONG_PASSWORD });
  return { accessToken: res.body.accessToken as string, userId: res.body.user.id as string };
}

/** Created directly — POST /repos would require a live GitHub round trip. */
async function createRepo(userId: string, fullName = "octocat/Hello-World") {
  return prisma.repo.create({
    data: {
      userId,
      githubRepoId: randomUUID(),
      fullName,
      defaultBranch: "main",
      indexStatus: "COMPLETED",
    },
  });
}

async function createSession(accessToken: string, repoId: string): Promise<string> {
  const res = await request(app)
    .post("/chat/sessions")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ repoId });
  return res.body.session.id as string;
}

describe("chat sessions", () => {
  it("creates a session for an owned repo", async () => {
    const { accessToken, userId } = await signupUser("create");
    const repo = await createRepo(userId);

    const res = await request(app)
      .post("/chat/sessions")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ repoId: repo.id });

    expect(res.status).toBe(201);
    expect(res.body.session).toMatchObject({ title: null, messageCount: 0 });
    expect(res.body.session.id).toBeTruthy();
  });

  it("refuses to create a session against someone else's repo", async () => {
    const owner = await signupUser("owner");
    const intruder = await signupUser("intruder");
    const repo = await createRepo(owner.userId);

    const res = await request(app)
      .post("/chat/sessions")
      .set("Authorization", `Bearer ${intruder.accessToken}`)
      .send({ repoId: repo.id });

    // Same 404 as a non-existent repo — a 403 would confirm the id is real.
    expect(res.status).toBe(404);
  });

  it("lists sessions for one repo, most recently updated first", async () => {
    const { accessToken, userId } = await signupUser("list");
    const repo = await createRepo(userId);
    const first = await createSession(accessToken, repo.id);
    const second = await createSession(accessToken, repo.id);

    const res = await request(app)
      .get("/chat/sessions")
      .query({ repoId: repo.id })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.sessions.map((s: { id: string }) => s.id)).toEqual([second, first]);
    expect(res.body.sessions[0].repo).toMatchObject({ id: repo.id, fullName: repo.fullName });
  });

  it("lists sessions across every repo when repoId is omitted", async () => {
    const { accessToken, userId } = await signupUser("all");
    const repoA = await createRepo(userId, "octocat/alpha");
    const repoB = await createRepo(userId, "octocat/beta");
    await createSession(accessToken, repoA.id);
    await createSession(accessToken, repoB.id);

    const res = await request(app)
      .get("/chat/sessions")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const names = res.body.sessions.map((s: { repo: { fullName: string } }) => s.repo.fullName);
    expect(names).toContain("octocat/alpha");
    expect(names).toContain("octocat/beta");
  });

  it("never leaks another user's sessions", async () => {
    const owner = await signupUser("leak-owner");
    const other = await signupUser("leak-other");
    const repo = await createRepo(owner.userId);
    await createSession(owner.accessToken, repo.id);

    const res = await request(app)
      .get("/chat/sessions")
      .set("Authorization", `Bearer ${other.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
  });

  it("deletes an owned session and 404s on someone else's", async () => {
    const owner = await signupUser("del-owner");
    const intruder = await signupUser("del-intruder");
    const repo = await createRepo(owner.userId);
    const sessionId = await createSession(owner.accessToken, repo.id);

    const denied = await request(app)
      .delete(`/chat/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${intruder.accessToken}`);
    expect(denied.status).toBe(404);

    const allowed = await request(app)
      .delete(`/chat/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(allowed.status).toBe(204);

    expect(await prisma.chatSession.findUnique({ where: { id: sessionId } })).toBeNull();
  });
});

describe("chat messages", () => {
  it("returns messages oldest first and 404s for another user", async () => {
    const owner = await signupUser("msg-owner");
    const intruder = await signupUser("msg-intruder");
    const repo = await createRepo(owner.userId);
    const sessionId = await createSession(owner.accessToken, repo.id);

    await prisma.message.create({
      data: { chatSessionId: sessionId, role: "USER", content: "first" },
    });
    await prisma.message.create({
      data: { chatSessionId: sessionId, role: "ASSISTANT", content: "second" },
    });

    const res = await request(app)
      .get(`/chat/sessions/${sessionId}/messages`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.messages.map((m: { content: string }) => m.content)).toEqual([
      "first",
      "second",
    ]);

    const denied = await request(app)
      .get(`/chat/sessions/${sessionId}/messages`)
      .set("Authorization", `Bearer ${intruder.accessToken}`);
    expect(denied.status).toBe(404);
  });
});

describe("POST /chat/query", () => {
  async function ask(query = "How does auth work?") {
    const { accessToken, userId } = await signupUser("query");
    const repo = await createRepo(userId);
    const sessionId = await createSession(accessToken, repo.id);

    const res = await request(app)
      .post("/chat/query")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ query, repoId: repo.id, chatSessionId: sessionId, chatHistory: [] });

    return { res, sessionId, accessToken, repo };
  }

  it("persists the question before answering, and titles the session with it", async () => {
    queryResponse = sseStream([
      { node: "planner", data: { intent: "architecture" } },
      { node: "architecture_agent", data: { generated_response: "Auth uses JWTs." } },
      { node: "done" },
    ]);

    const { res, sessionId } = await ask("How does auth work?");
    expect(res.status).toBe(200);

    const messages = await prisma.message.findMany({
      where: { chatSessionId: sessionId },
      orderBy: { createdAt: "asc" },
    });
    expect(messages.map((m) => m.role)).toEqual(["USER", "ASSISTANT"]);
    expect(messages[0].content).toBe("How does auth work?");
    expect(messages[1].content).toBe("Auth uses JWTs.");
    expect(messages[1].agentType).toBe("architecture");

    const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
    expect(session?.title).toBe("How does auth work?");
  });

  it("relays every graph frame to the user over Socket.IO", async () => {
    queryResponse = sseStream([
      { node: "planner", data: { intent: "architecture" } },
      { node: "architecture_agent", data: { generated_response: "ok" } },
      { node: "reviewer", data: { reviewer_verdict: { approved: true } } },
      { node: "done" },
    ]);

    await ask();

    const events = emitToUser.mock.calls.filter((call) => call[1] === "queryProgress");
    expect(events.map((call) => (call[2] as { node: string }).node)).toEqual([
      "planner",
      "architecture_agent",
      "reviewer",
      "done",
    ]);
  });

  it("records an approved verdict when the reviewer passes", async () => {
    queryResponse = sseStream([
      { node: "planner", data: { intent: "architecture" } },
      { node: "architecture_agent", data: { generated_response: "grounded answer" } },
      { node: "reviewer", data: { reviewer_verdict: { approved: true, grounding_issues: [], missing_info: [] } } },
      { node: "done" },
    ]);

    const { sessionId } = await ask();
    const assistant = await prisma.message.findFirst({
      where: { chatSessionId: sessionId, role: "ASSISTANT" },
    });

    expect(assistant?.reviewerVerdict).toMatchObject({ approved: true, regenerationCount: 0 });
  });

  // The regression that produced a 502 for every thrice-rejected answer:
  // attach_incomplete_flag replaces generated_response with an object, and
  // only the string shape used to be understood.
  it("keeps a flagged answer instead of failing when the reviewer rejects it", async () => {
    queryResponse = sseStream([
      { node: "planner", data: { intent: "bug_investigation" } },
      { node: "bug_investigation_agent", data: { generated_response: "attempt one" } },
      { node: "reviewer", data: { reviewer_verdict: { approved: false, grounding_issues: ["unsupported"], missing_info: [] } } },
      {
        node: "bug_investigation_agent",
        data: {
          generated_response: {
            response: "best effort answer",
            reviewer_approved: false,
            reviewer_notes: ["unsupported claim", "no repro steps"],
          },
          regeneration_count: 2,
        },
      },
      { node: "done" },
    ]);

    const { res, sessionId } = await ask("Why are payments stuck?");

    expect(res.status).toBe(200);

    const assistant = await prisma.message.findFirst({
      where: { chatSessionId: sessionId, role: "ASSISTANT" },
    });
    expect(assistant?.content).toBe("best effort answer");
    expect(assistant?.agentType).toBe("bug_investigation");
    expect(assistant?.reviewerVerdict).toMatchObject({
      approved: false,
      notes: ["unsupported claim", "no repro steps"],
      regenerationCount: 2,
    });
  });

  it("502s when the graph produces no answer at all", async () => {
    queryResponse = sseStream([
      { node: "planner", data: { intent: "architecture" } },
      { node: "done" },
    ]);

    const { res, sessionId } = await ask();
    expect(res.status).toBe(502);

    // The question is still on record even though the answer failed.
    const messages = await prisma.message.findMany({ where: { chatSessionId: sessionId } });
    expect(messages.map((m) => m.role)).toEqual(["USER"]);
  });

  it("refuses to query another user's repo", async () => {
    const owner = await signupUser("q-owner");
    const intruder = await signupUser("q-intruder");
    const repo = await createRepo(owner.userId);
    const sessionId = await createSession(owner.accessToken, repo.id);

    const res = await request(app)
      .post("/chat/query")
      .set("Authorization", `Bearer ${intruder.accessToken}`)
      .send({ query: "leak me the code", repoId: repo.id, chatSessionId: sessionId, chatHistory: [] });

    expect(res.status).toBe(404);
  });
});
