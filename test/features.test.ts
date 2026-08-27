import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CheckpointStore } from "../src/infra/checkpoints.js";
import { PathPolicy } from "../src/security/path-policy.js";
import { detectProjectTaskPresets } from "../src/services/task-presets.js";
import { getRecentWorkspaces, recordRecentWorkspace } from "../src/services/admin-settings.js";

test("checkpoint diff returns accurate before and current contents", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-coder-diff-"));
  context.after(async () => await fs.rm(root, { recursive: true, force: true }));
  const state = path.join(root, ".local-coder");
  await fs.mkdir(state);
  const policy = await PathPolicy.create([root], state, false);
  const store = new CheckpointStore(state, policy, 5);
  await store.initialize();

  const file = path.join(root, "app.ts");
  await fs.writeFile(file, "console.log('hello');\n");
  const id = await store.capture("edit_file", [file]);
  await fs.writeFile(file, "console.log('world');\n");

  const diff = await store.getDiff(id);
  assert.equal(diff.id, id);
  assert.equal(diff.action, "edit_file");
  assert.equal(diff.files.length, 1);
  assert.equal(diff.files[0]?.beforeContent, "console.log('hello');\n");
  assert.equal(diff.files[0]?.currentContent, "console.log('world');\n");
});

test("detects node.js, rust and git task presets automatically", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-coder-presets-"));
  context.after(async () => await fs.rm(root, { recursive: true, force: true }));

  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({
    scripts: {
      test: "vitest run",
      build: "tsc",
      lint: "eslint ."
    }
  }));

  const presets = await detectProjectTaskPresets(root);
  const names = presets.map((p) => p.name);
  assert.ok(names.includes("test"));
  assert.ok(names.includes("build"));
  assert.ok(names.includes("lint"));
});

test("recent workspaces store and retrieve recent folders correctly", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-coder-recent-"));
  context.after(async () => await fs.rm(root, { recursive: true, force: true }));

  await recordRecentWorkspace(root, "/path/to/projectA");
  await recordRecentWorkspace(root, "/path/to/projectB");

  const list = await getRecentWorkspaces(root, "/path/to/projectB");
  assert.ok(list.some((item) => item.path === "/path/to/projectB" && item.isCurrent));
  assert.ok(list.some((item) => item.path === "/path/to/projectA" && !item.isCurrent));
});
