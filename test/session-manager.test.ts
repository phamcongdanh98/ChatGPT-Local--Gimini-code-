import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpSessionManager } from "../src/mcp/session-manager.js";

test("McpSessionManager evicts the oldest session via LRU when maxSessions is reached", async (context) => {
  const maxSessions = 2;
  const manager = new McpSessionManager(
    () => new McpServer({ name: "test-server", version: "1.0.0" }),
    60_000,
    maxSessions
  );
  context.after(async () => await manager.close());

  const app = express();
  app.use(express.json());
  app.post("/mcp", (req, res) => void manager.post(req, res));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  context.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const url = `http://127.0.0.1:${port}/mcp`;

  const initializePayload = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    },
  };

  const res1 = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify(initializePayload),
  });
  assert.equal(res1.status, 200);
  assert.equal(manager.size, 1);

  const res2 = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify(initializePayload),
  });
  assert.equal(res2.status, 200);
  assert.equal(manager.size, 2);

  // Third session should evict the oldest session and maintain size <= maxSessions
  const res3 = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify(initializePayload),
  });
  assert.equal(res3.status, 200);
  assert.equal(manager.size, 2);
});
