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
