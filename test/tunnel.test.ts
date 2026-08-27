import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { buildTunnelCommand, parseTunnelPort, parseTunnelProvider, tunnelEnvironment } from "../src/cli/tunnel.js";
import { extractTunnelUrl, TunnelManager, type TunnelSpawner } from "../src/services/tunnel-manager.js";

function fakeTunnelChild(): ReturnType<TunnelSpawner> {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    kill: (signal?: NodeJS.Signals) => boolean;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = (signal = "SIGTERM") => {
    setImmediate(() => child.emit("close", null, signal));
    return true;
  };
  return child as unknown as ReturnType<TunnelSpawner>;
}

test("tunnel command forwards only the configured MCP port", () => {
  assert.deepEqual(buildTunnelCommand("pinggy", 3300, "darwin"), {
    command: "ssh",
    args: [
      "-o", "ExitOnForwardFailure=yes",
      "-o", "BatchMode=yes",
      "-o", "NumberOfPasswordPrompts=0",
      "-o", "ServerAliveInterval=30",
      "-o", "StrictHostKeyChecking=accept-new",
      "-p", "443",
      "-R0:localhost:3300",
      "a.pinggy.io",
    ],
  });
  assert.deepEqual(buildTunnelCommand("cloudflared", 3000, "win32"), {
    command: "cloudflared.exe",
    args: ["tunnel", "--url", "http://127.0.0.1:3000", "--no-autoupdate"],
  });
  assert.deepEqual(buildTunnelCommand("cloudflared", 3000, { cloudflareToken: "eyJh..." }), {
    command: "cloudflared",
    args: ["tunnel", "run", "--token", "eyJh..."],
  });
  assert.deepEqual(buildTunnelCommand("ngrok", 3000, { ngrokDomain: "custom.ngrok-free.app", ngrokToken: "tok123" }), {
    command: "ngrok",
    args: ["http", "3000", "--domain", "custom.ngrok-free.app", "--authtoken", "tok123"],
  });
});

test("tunnel configuration rejects invalid input and strips secrets", () => {
  assert.equal(parseTunnelProvider(undefined), "cloudflared");
  assert.equal(parseTunnelProvider("PINGGY"), "pinggy");
  assert.equal(parseTunnelProvider("NGROK"), "ngrok");
  assert.throws(() => parseTunnelProvider("shell"), /cloudflared, pinggy hoặc ngrok/);
  assert.equal(parseTunnelPort("3000"), 3000);
  assert.throws(() => parseTunnelPort("0"), /1 đến 65535/);
  const safe = tunnelEnvironment({ PATH: "/bin", HOME: "/tmp/home", MCP_TOKEN: "secret", ADMIN_TOKEN: "secret-admin" });
  assert.equal(safe.PATH, "/bin");
  assert.equal(safe.HOME, "/tmp/home");
  assert.equal(safe.MCP_TOKEN, undefined);
  assert.equal(safe.ADMIN_TOKEN, undefined);
});

test("tunnel URL parser accepts only the selected provider domain", () => {
  assert.equal(
    extractTunnelUrl("\u001b[32mForwarding: https://demo.a.free.pinggy.link\u001b[0m", "pinggy"),
    "https://demo.a.free.pinggy.link",
  );
  assert.equal(extractTunnelUrl("https://example.com/mcp", "pinggy"), undefined);
  assert.equal(
    extractTunnelUrl("Visit https://random.trycloudflare.com now", "cloudflared"),
    "https://random.trycloudflare.com",
  );
  assert.equal(
    extractTunnelUrl("Forwarding https://my-app.ngrok-free.app -> http://localhost:3000", "ngrok"),
    "https://my-app.ngrok-free.app",
  );
  assert.equal(
    extractTunnelUrl("", "cloudflared", "mcp.customdomain.com"),
    "https://mcp.customdomain.com",
  );
});

test("dashboard tunnel times out and terminates a provider that never returns a URL", async () => {
  const child = fakeTunnelChild();
  const manager = new TunnelManager(10, () => {
    setImmediate(() => child.emit("spawn"));
    return child;
  });
  await manager.start("pinggy", 3300);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(manager.status().state, "failed");
  assert.match(manager.status().error ?? "", /không trả URL/);
  await manager.shutdown();
  assert.equal(manager.status().state, "stopped");
});

test("dashboard tunnel becomes ready only after an allowlisted public URL", async () => {
  const child = fakeTunnelChild();
  const manager = new TunnelManager(1_000, () => {
    setImmediate(() => child.emit("spawn"));
    return child;
  });
  await manager.start("cloudflared", 3300);
  (child.stderr as PassThrough).write("URL: https://ready.trycloudflare.com\n");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(manager.status().publicUrl, "https://ready.trycloudflare.com");
  assert.equal(manager.status().state, "running");
  await manager.shutdown();
});
