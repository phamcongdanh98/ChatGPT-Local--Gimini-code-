import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CheckpointStore } from "../src/infra/checkpoints.js";
import { PathPolicy } from "../src/security/path-policy.js";

test("checkpoint restores existing and newly-created files", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-coder-checkpoint-"));
  context.after(async () => await fs.rm(root, { recursive: true, force: true }));
  const state = path.join(root, ".local-coder");
  await fs.mkdir(state);
  const policy = await PathPolicy.create([root], state, false);
  const store = new CheckpointStore(state, policy, 5);
  await store.initialize();
  const existing = path.join(root, "existing.txt");
  const created = path.join(root, "created.txt");
  await fs.writeFile(existing, "before");
  const id = await store.capture("test", [existing, created]);
  await fs.writeFile(existing, "after");
  await fs.writeFile(created, "new");
  await store.restore(id);
  assert.equal(await fs.readFile(existing, "utf8"), "before");
  await assert.rejects(fs.stat(created), { code: "ENOENT" });
});
