import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { startApplication } from "../src/http/app.js";
import { TunnelManager, type TunnelStatus } from "../src/services/tunnel-manager.js";

class RecordingTunnelManager extends TunnelManager {
  starts: Array<{ provider: string | undefined; port: number }> = [];
  shutdownCount = 0;

  override async start(provider: string | undefined, port: number): Promise<TunnelStatus> {
    this.starts.push({ provider, port });
    return { state: "starting", provider: provider === "pinggy" ? "pinggy" : "cloudflared" };
  }

  override async shutdown(): Promise<void> {
    this.shutdownCount += 1;
  }
}

test("application auto-starts the configured tunnel and owns its shutdown", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-coder-auto-tunnel-"));
  const stateDir = path.join(root, ".local-coder");
  const tasksFile = path.join(stateDir, "tasks.json");
  await fs.mkdir(stateDir);
  await fs.writeFile(tasksFile, JSON.stringify({ version: 1, tasks: {} }));
  const tunnel = new RecordingTunnelManager();
  const config = loadConfig({
    MCP_TOKEN: "x".repeat(32),
    WORKSPACE_PATH: root,
    STATE_DIR: stateDir,
    TASKS_FILE: tasksFile,
    HOST: "127.0.0.1",
    PORT: "0",
    AUTO_START_TUNNEL: "true",
    TUNNEL_PROVIDER: "pinggy",
  });
  const application = await startApplication(config, { tunnel });
  try {
    assert.deepEqual(tunnel.starts, [{ provider: "pinggy", port: application.port }]);
  } finally {
    await application.close();
    await fs.rm(root, { recursive: true, force: true });
  }
  assert.equal(tunnel.shutdownCount, 1);
});
