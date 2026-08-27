import crypto from "node:crypto";
import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  lastSeen: number;
}

export class McpSessionManager {
  private readonly sessions = new Map<string, Session>();
  private readonly cleanupTimer: NodeJS.Timeout;
  private pendingInitializations = 0;

  constructor(
    private readonly createServer: () => McpServer,
    private readonly ttlMs: number,
    private readonly maxSessions = 16,
  ) {
    this.cleanupTimer = setInterval(() => void this.cleanup(), Math.min(60_000, Math.max(10_000, ttlMs / 2)));
    this.cleanupTimer.unref();
  }

  get size(): number {
    return this.sessions.size;
  }

  getStats(): { count: number; lastSeen: number | undefined; sessionIds: string[] } {
    let lastSeen: number | undefined;
    const sessionIds: string[] = [];
    for (const [id, session] of this.sessions) {
      sessionIds.push(id);
      if (lastSeen === undefined || session.lastSeen > lastSeen) {
        lastSeen = session.lastSeen;
      }
    }
    return { count: this.sessions.size, lastSeen, sessionIds };
  }

  async post(request: Request, response: Response): Promise<void> {
    let provisionalServer: McpServer | undefined;
    let provisionalTransport: StreamableHTTPServerTransport | undefined;
    let reservedInitialization = false;
    try {
      const sessionId = this.sessionId(request);
      if (sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return this.jsonRpcError(response, 404, "Unknown or expired MCP session");
        session.lastSeen = Date.now();
        await session.transport.handleRequest(request, response, request.body);
        return;
      }
      if (!isInitializeRequest(request.body)) {
        return this.jsonRpcError(response, 400, "Initialize request required when no MCP session id is present");
      }
      if (this.sessions.size + this.pendingInitializations >= this.maxSessions) {
        return this.jsonRpcError(response, 429, "MCP session limit reached; close an existing session and retry");
      }
      this.pendingInitializations += 1;
      reservedInitialization = true;

      provisionalServer = this.createServer();
      provisionalTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (initializedId) => {
          if (provisionalTransport && provisionalServer) {
            this.sessions.set(initializedId, {
              transport: provisionalTransport,
              server: provisionalServer,
              lastSeen: Date.now(),
            });
          }
        },
      });
      provisionalTransport.onclose = () => {
        const id = provisionalTransport?.sessionId;
        if (id) this.sessions.delete(id);
      };
      // SDK 1.30's Transport optional callbacks are stricter than its concrete
      // StreamableHTTP transport under exactOptionalPropertyTypes.
      await provisionalServer.connect(provisionalTransport as Parameters<McpServer["connect"]>[0]);
      await provisionalTransport.handleRequest(request, response, request.body);
    } catch {
      const initializedId = provisionalTransport?.sessionId;
      if (initializedId) this.sessions.delete(initializedId);
      await provisionalTransport?.close().catch(() => undefined);
      await provisionalServer?.close().catch(() => undefined);
      if (!response.headersSent) this.jsonRpcError(response, 500, "Internal MCP server error");
    } finally {
      if (reservedInitialization) this.pendingInitializations -= 1;
    }
  }

  async get(request: Request, response: Response): Promise<void> {
    const session = this.lookup(request, response);
    if (!session) return;
    session.lastSeen = Date.now();
    await session.transport.handleRequest(request, response);
  }

  async delete(request: Request, response: Response): Promise<void> {
    const sessionId = this.sessionId(request);
    const session = this.lookup(request, response);
    if (!session || !sessionId) return;
    session.lastSeen = Date.now();
    await session.transport.handleRequest(request, response);
    await this.closeSession(sessionId, session);
  }

  async close(): Promise<void> {
    clearInterval(this.cleanupTimer);
    await Promise.all([...this.sessions].map(async ([id, session]) => await this.closeSession(id, session)));
  }

  private sessionId(request: Request): string | undefined {
    const header = request.headers["mcp-session-id"];
    return Array.isArray(header) ? header[0] : header;
  }

  private lookup(request: Request, response: Response): Session | undefined {
    const id = this.sessionId(request);
    if (!id) {
      this.jsonRpcError(response, 400, "MCP session id is required");
      return undefined;
    }
    const session = this.sessions.get(id);
    if (!session) {
      this.jsonRpcError(response, 404, "Unknown or expired MCP session");
      return undefined;
    }
    return session;
  }

  private async cleanup(): Promise<void> {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, session] of this.sessions) {
      if (session.lastSeen < cutoff) await this.closeSession(id, session);
    }
  }

  private async closeSession(id: string, session: Session): Promise<void> {
    this.sessions.delete(id);
    await session.transport.close().catch(() => undefined);
    await session.server.close().catch(() => undefined);
  }

  private jsonRpcError(response: Response, status: number, message: string): void {
    response.status(status).json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });
  }
}
