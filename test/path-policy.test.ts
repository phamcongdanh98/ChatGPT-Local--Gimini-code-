import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PathPolicy } from "../src/security/path-policy.js";

test("path policy blocks traversal, symlink escape, state, and secrets", async (context) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "local-coder-path-"));
  context.after(async () => await fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, "workspace");
  const outside = path.join(base, "outside");
  const state = path.join(root, ".local-coder");
  await fs.mkdir(state, { recursive: true });
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, "secret.txt"), "outside");
  await fs.symlink(outside, path.join(root, "escape"));
  await fs.writeFile(path.join(root, ".env"), "KEY=value");
  await fs.writeFile(path.join(root, ".env.example"), "KEY=");
  await fs.mkdir(path.join(root, ".git"));
  await fs.writeFile(path.join(root, ".git", "config"), "[remote]");
  const policy = await PathPolicy.create([root], state, false);

  await assert.rejects(policy.resolve("../outside/secret.txt", { mustExist: true }), /outside/);
  await assert.rejects(policy.resolve("escape/secret.txt", { mustExist: true }), /outside/);
  await assert.rejects(policy.resolve(".local-coder/audit.jsonl"), /not accessible/);
  await assert.rejects(policy.resolve(".env", { mustExist: true }), /Sensitive/);
  await assert.rejects(policy.resolve(".git/config", { mustExist: true }), /metadata/);
  assert.equal(await policy.resolve(".env.example", { mustExist: true }), await fs.realpath(path.join(root, ".env.example")));
});
