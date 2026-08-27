import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PathPolicy } from "../src/security/path-policy.js";
import { projectContext } from "../src/services/context.js";

test("project context does not follow a manifest symlink outside the workspace", async (context) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "local-secure-context-"));
  context.after(async () => await fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, "workspace");
  const state = path.join(root, ".local-coder");
  const outside = path.join(base, "outside.md");
  await fs.mkdir(state, { recursive: true });
  await fs.writeFile(outside, "OUTSIDE_FIXTURE_SECRET");
  await fs.symlink(outside, path.join(root, "README.md"));
  const policy = await PathPolicy.create([root], state, false);

  await assert.rejects(projectContext(policy, 10_000), /outside configured workspace roots/);
});
