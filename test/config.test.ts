import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.js";

const validWorkspace = process.cwd();

test("config requires a strong token", () => {
  assert.throws(() => loadConfig({ MCP_TOKEN: "short", WORKSPACE_PATH: validWorkspace }), /at least 32/);
});

test("dangerous capabilities default off", () => {
  const config = loadConfig({ MCP_TOKEN: "x".repeat(32), WORKSPACE_PATH: validWorkspace }, process.cwd());
  assert.equal(config.allowDestructive, false);
  assert.equal(config.allowRemoteGit, false);
  assert.equal(config.allowUnsafeShell, false);
  assert.equal(config.allowSensitiveFiles, false);
  assert.equal(config.allowUrlToken, false);
  assert.equal(config.autoStartTunnel, false);
  assert.equal(config.tunnelProvider, "cloudflared");
});

test("quick URL mode is explicit and validates its provider", () => {
  const config = loadConfig({
    MCP_TOKEN: "x".repeat(32),
    WORKSPACE_PATH: validWorkspace,
    ALLOW_URL_TOKEN: "true",
    AUTO_START_TUNNEL: "true",
    TUNNEL_PROVIDER: "pinggy",
  }, process.cwd());
  assert.equal(config.allowUrlToken, true);
  assert.equal(config.autoStartTunnel, true);
  assert.equal(config.tunnelProvider, "pinggy");
  assert.throws(() => loadConfig({
    MCP_TOKEN: "x".repeat(32),
    WORKSPACE_PATH: validWorkspace,
    TUNNEL_PROVIDER: "unknown",
  }, process.cwd()), /cloudflared or pinggy/);
});

test("workspace must be explicit and cannot be an entire drive or Home", () => {
  assert.throws(() => loadConfig({ MCP_TOKEN: "x".repeat(32) }), /WORKSPACE_PATH is required/);
  assert.throws(
    () => loadConfig({ MCP_TOKEN: "x".repeat(32), WORKSPACE_PATH: path.parse(validWorkspace).root }),
    /entire drive/,
  );
});

test("task registry must remain inside protected state", () => {
  assert.throws(() => loadConfig({
    MCP_TOKEN: "x".repeat(32),
    WORKSPACE_PATH: validWorkspace,
    TASKS_FILE: "tasks.json",
  }, process.cwd()), /inside STATE_DIR/);
});
