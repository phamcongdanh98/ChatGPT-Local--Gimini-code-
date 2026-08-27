import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startSetupServer } from "../src/http/setup.js";

test("first-run UI creates a safe config without exposing permanent tokens", async (context) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "local-secure-first-run-"));
  context.after(async () => await fs.rm(projectRoot, { recursive: true, force: true }));
  const workspace = path.join(projectRoot, "workspace");
  await fs.mkdir(path.join(projectRoot, "profiles"), { recursive: true });
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(projectRoot, "profiles", "tasks.example.json"), JSON.stringify({ version: 1, tasks: {} }));
  const handoffToken = "one-time-handoff".padEnd(40, "x");
  const setup = await startSetupServer({ projectRoot, port: 0, handoffToken, pickFolder: async () => workspace });
  context.after(async () => await setup.close().catch(() => undefined));
  const base = `http://127.0.0.1:${setup.port}`;

  const page = await fetch(`${base}/setup`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Chọn project/);
  assert.match(page.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  assert.equal((await fetch(`${base}/api/pick`, { method: "POST" })).status, 403);
  const picked = await fetch(`${base}/api/pick`, { method: "POST", headers: { "X-Local-Setup": "1" } }).then((response) => response.json());
  assert.equal(picked.selected, workspace);

  const configured = await fetch(`${base}/api/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Local-Setup": "1" },
    body: JSON.stringify({ workspacePath: workspace, permissionMode: "workspace-write" }),
  });
  assert.equal(configured.status, 200);
  const result = await configured.json();
  assert.deepEqual(result, { ok: true, handoffToken });
  await setup.completed;
  await setup.close();

  const environment = await fs.readFile(path.join(projectRoot, ".env"), "utf8");
  assert.match(environment, /MCP_TOKEN=.{32,}/);
  assert.match(environment, /ADMIN_TOKEN=.{32,}/);
  assert.match(environment, /ALLOW_URL_TOKEN=false/);
  assert.match(environment, /ALLOW_UNSAFE_SHELL=false/);
  assert.equal(environment.includes(handoffToken), false);
});
