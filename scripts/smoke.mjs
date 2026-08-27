import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadConfig } from "../dist/src/config.js";
import { startApplication } from "../dist/src/http/app.js";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-coder-smoke-"));
const state = path.join(root, ".local-coder");
await fs.mkdir(state);
await fs.writeFile(path.join(root, "README.md"), "# Smoke project\n");
await fs.writeFile(path.join(state, "tasks.json"), JSON.stringify({
  version: 1,
  tasks: {
    hello: { description: "Print hello", program: process.execPath, args: ["-e", "process.stdout.write('hello')"] },
  },
}));

const token = "smoke-token-".padEnd(40, "x");
const adminToken = "smoke-admin-token-".padEnd(40, "y");
const envFile = path.join(root, ".env");
await fs.writeFile(envFile, `MCP_TOKEN=${token}\nADMIN_TOKEN=${adminToken}\nWORKSPACE_PATH=${root}\n`, { mode: 0o600 });
const config = loadConfig({
  MCP_TOKEN: token,
  WORKSPACE_PATH: root,
  STATE_DIR: state,
  TASKS_FILE: path.join(state, "tasks.json"),
  HOST: "127.0.0.1",
  PORT: "0",
  ADMIN_ENABLED: "true",
  ADMIN_PORT: "0",
  ADMIN_TOKEN: adminToken,
  ALLOW_URL_TOKEN: "false",
});
const handoffToken = "smoke-handoff-token-".padEnd(40, "z");
const app = await startApplication(config, { envFile, pickFolder: async () => root, adminHandoffToken: handoffToken });
const client = new Client({ name: "local-coder-smoke", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${app.port}/mcp`), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});

try {
  const unauthorized = await fetch(`http://127.0.0.1:${app.port}/mcp`);
  assert.equal(unauthorized.status, 401);
  const health = await fetch(`http://127.0.0.1:${app.port}/healthz`).then((response) => response.json());
  assert.deepEqual(Object.keys(health).sort(), ["name", "status", "version"]);
  await client.connect(transport);
  const tools = await client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === "apply_patch"));
  assert.ok(!tools.tools.some((tool) => tool.name === "unsafe_shell"));

  const write = await client.callTool({ name: "write_file", arguments: { path: "src/example.txt", content: "one\ntwo\n", createParents: true } });
  assert.equal(write.isError, undefined);
  const patch = await client.callTool({ name: "apply_patch", arguments: { path: "src/example.txt", patch: "@@\n one\n-two\n+TWO" } });
  assert.equal(patch.isError, undefined);
  const read = await client.callTool({ name: "read_text_file", arguments: { path: "src/example.txt" } });
  assert.match(read.content[0].type === "text" ? read.content[0].text : "", /TWO/);
  const task = await client.callTool({ name: "run_task", arguments: { name: "hello" } });
  assert.match(task.content[0].type === "text" ? task.content[0].text : "", /hello/);
  const denied = await client.callTool({ name: "read_text_file", arguments: { path: "../outside.txt" } });
  assert.equal(denied.isError, true);
  assert.notEqual(app.adminPort, undefined);
  const adminBase = `http://127.0.0.1:${app.adminPort}`;
  const adminAuthorization = `Basic ${Buffer.from(`admin:${adminToken}`).toString("base64")}`;
  const adminHeaders = { Authorization: adminAuthorization };
  const adminActionHeaders = { ...adminHeaders, "X-Local-Coder-Admin": "1" };
  const handoff = await fetch(`${adminBase}/bootstrap-session/${handoffToken}`, { redirect: "manual" });
  assert.equal(handoff.status, 303);
  assert.equal(handoff.headers.get("location"), "/ui");
  assert.match(handoff.headers.get("set-cookie") ?? "", /HttpOnly; SameSite=Strict/);
  assert.equal((await fetch(`${adminBase}/bootstrap-session/${handoffToken}`)).status, 404);
  const unauthenticatedDashboard = await fetch(adminBase, { redirect: "manual" });
  assert.equal(unauthenticatedDashboard.status, 303);
  assert.equal(unauthenticatedDashboard.headers.get("location"), "/login");
  assert.equal((await fetch(`${adminBase}/api/status`)).status, 401);
  assert.match(await fetch(`${adminBase}/login`).then((response) => response.text()), /ADMIN_TOKEN/);
  const invalidLogin = await fetch(`${adminBase}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: "wrong-token" }),
  });
  assert.equal(invalidLogin.status, 401);
  const validLogin = await fetch(`${adminBase}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: adminToken }),
    redirect: "manual",
  });
  assert.equal(validLogin.status, 303);
  assert.equal(validLogin.headers.get("location"), "/ui");
  assert.match(validLogin.headers.get("set-cookie") ?? "", /HttpOnly; SameSite=Strict/);
  const dashboardResponse = await fetch(adminBase, { headers: adminHeaders });
  assert.equal(dashboardResponse.status, 200);
  assert.match(dashboardResponse.headers.get("content-security-policy") ?? "", /script-src 'self'/);
  assert.doesNotMatch(dashboardResponse.headers.get("content-security-policy") ?? "", /unsafe-inline/);
  assert.match(await dashboardResponse.text(), /Local Coder/);
  const dashboardUi = await fetch(`${adminBase}/ui`, { headers: adminHeaders });
  assert.equal(dashboardUi.status, 200);
  assert.match(await dashboardUi.text(), /Kết nối ChatGPT với code trên máy/);
  assert.match(await fetch(`${adminBase}/assets/admin.css`, { headers: adminHeaders }).then((response) => response.text()), /--green:/);
  assert.match(await fetch(`${adminBase}/assets/admin.js`, { headers: adminHeaders }).then((response) => response.text()), /api\/diagnostics/);
  const adminStatus = await fetch(`${adminBase}/api/status`, { headers: adminHeaders }).then((response) => response.json());
  assert.equal(adminStatus.mcpEndpoint, `http://127.0.0.1:${app.port}/mcp`);
  assert.equal(JSON.stringify(adminStatus).includes(token), false);
  assert.equal(JSON.stringify(adminStatus).includes(root), false);
  const adminSettings = await fetch(`${adminBase}/api/settings`, { headers: adminHeaders }).then((response) => response.json());
  assert.equal(adminSettings.workspacePath, root);
  assert.equal((await fetch(`${adminBase}/api/secret`, { method: "POST", headers: adminHeaders })).status, 403);
  const adminSecret = await fetch(`${adminBase}/api/secret`, { method: "POST", headers: adminActionHeaders }).then((response) => response.json());
  assert.equal(adminSecret.mcpToken, token);
  assert.equal(adminSecret.connectorUrl, undefined);
  const folderSelection = await fetch(`${adminBase}/api/folder-picker`, { method: "POST", headers: adminActionHeaders }).then((response) => response.json());
  assert.equal(folderSelection.selected, root);
  const adminTasks = await fetch(`${adminBase}/api/tasks`, { headers: adminHeaders }).then((response) => response.json());
  assert.equal(adminTasks.tasks.length, 1);
  const adminCheckpoints = await fetch(`${adminBase}/api/checkpoints`, { headers: adminHeaders }).then((response) => response.json());
  assert.ok(adminCheckpoints.checkpoints.length >= 2);
  const adminDiagnostics = await fetch(`${adminBase}/api/diagnostics`, { method: "POST", headers: adminActionHeaders }).then((response) => response.json());
  assert.equal(adminDiagnostics.ok, true);
  assert.equal(adminDiagnostics.checks.length, 5);
  const adminTestConn = await fetch(`${adminBase}/api/test-connection`, { method: "POST", headers: adminActionHeaders }).then((response) => response.json());
  assert.equal(adminTestConn.steps.localServer.ok, true);
  assert.equal(adminTestConn.steps.protocol.ok, true);
  assert.equal(typeof adminTestConn.summary, "string");
  const settingsUpdate = await fetch(`${adminBase}/api/settings`, {
    method: "POST",
    headers: { ...adminActionHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      workspacePath: root,
      permissionMode: "read-only",
      allowDestructive: false,
      allowRemoteGit: false,
      allowUnsafeShell: false,
      allowSensitiveFiles: false,
    }),
  });
  assert.equal(settingsUpdate.status, 200);
  assert.equal((await settingsUpdate.json()).sessionsReset, true);
  const updatedStatus = await fetch(`${adminBase}/api/status`, { headers: adminHeaders }).then((response) => response.json());
  assert.equal(updatedStatus.config.permissionMode, "read-only");
  assert.match(await fs.readFile(envFile, "utf8"), /PERMISSION_MODE=read-only/);
  process.stdout.write(`Smoke passed: auth, session, tools, checkpointed edits, task registry, path denial (${tools.tools.length} tools).\n`);
  process.stdout.write("Dashboard passed: auth, CSRF guard, secret reveal, folder selection, hot settings reload, CSP, status, tasks, checkpoints, and diagnostics.\n");
} finally {
  await client.close().catch(() => undefined);
  await app.close();
}

const readOnlyConfig = loadConfig({
  MCP_TOKEN: token,
  WORKSPACE_PATH: root,
  STATE_DIR: state,
  TASKS_FILE: path.join(state, "tasks.json"),
  HOST: "127.0.0.1",
  PORT: "0",
  PERMISSION_MODE: "read-only",
  ALLOW_DESTRUCTIVE: "true",
  ALLOW_REMOTE_GIT: "true",
  ALLOW_UNSAFE_SHELL: "true",
  ALLOW_URL_TOKEN: "false",
});
const readOnlyApp = await startApplication(readOnlyConfig);
const readOnlyClient = new Client({ name: "local-coder-read-only-smoke", version: "1.0.0" });
const readOnlyTransport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${readOnlyApp.port}/mcp`), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
try {
  await readOnlyClient.connect(readOnlyTransport);
  const names = (await readOnlyClient.listTools()).tools.map((tool) => tool.name);
  for (const forbidden of ["write_file", "run_task", "delete_file", "git_push", "unsafe_shell"]) {
    assert.ok(!names.includes(forbidden), `${forbidden} must not be advertised in read-only mode`);
  }
  process.stdout.write(`Read-only profile passed: write, execution, destructive, remote, and shell tools are absent (${names.length} tools).\n`);
} finally {
  await readOnlyClient.close().catch(() => undefined);
  await readOnlyApp.close();
  await fs.rm(root, { recursive: true, force: true });
}
