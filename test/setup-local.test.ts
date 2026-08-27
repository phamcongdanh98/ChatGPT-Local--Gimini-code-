import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("local setup creates protected config once and never overwrites it", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-coder-setup-"));
  context.after(async () => await fs.rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace");
  await fs.mkdir(path.join(root, "profiles"), { recursive: true });
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(root, "profiles", "tasks.example.json"), JSON.stringify({ version: 1, tasks: {} }));
  const script = path.resolve("scripts/setup-local.mjs");

  await execFileAsync(process.execPath, [script, workspace], { cwd: root });
  const firstEnvironment = await fs.readFile(path.join(root, ".env"), "utf8");
  assert.match(firstEnvironment, /MCP_TOKEN=.{32,}/);
  assert.match(firstEnvironment, /ADMIN_ENABLED=true/);
  assert.match(firstEnvironment, /ALLOW_UNSAFE_SHELL=false/);
  assert.deepEqual(
    JSON.parse(await fs.readFile(path.join(workspace, ".local-coder", "tasks.json"), "utf8")),
    { version: 1, tasks: {} }
  );

  const second = await execFileAsync(process.execPath, [script, workspace], { cwd: root });
  assert.match(second.stdout, /không ghi đè/);
  assert.equal(await fs.readFile(path.join(root, ".env"), "utf8"), firstEnvironment);

  const secondRoot = path.join(root, "pnpm-style");
  await fs.mkdir(path.join(secondRoot, "profiles"), { recursive: true });
  await fs.writeFile(path.join(secondRoot, "profiles", "tasks.example.json"), JSON.stringify({ version: 1, tasks: {} }));
  await execFileAsync(process.execPath, [script, "--", secondRoot], { cwd: secondRoot });
  assert.match(await fs.readFile(path.join(secondRoot, ".env"), "utf8"), /ADMIN_ENABLED=true/);
});
