import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "dotenv";
import {
  canonicalWorkspace,
  parseAdminSettings,
  persistAdminSettings,
} from "../src/services/admin-settings.js";
import { buildFolderPickerCommand } from "../src/services/folder-picker.js";

test("admin settings require explicit booleans and block risky read-only combinations", () => {
  assert.equal(parseAdminSettings({
    workspacePath: "/tmp/project",
    permissionMode: "workspace-write",
    allowDestructive: false,
    allowRemoteGit: false,
    allowUnsafeShell: false,
    allowSensitiveFiles: false,
  }).permissionMode, "workspace-write");
  assert.throws(() => parseAdminSettings({
    workspacePath: "/tmp/project",
    permissionMode: "read-only",
    allowDestructive: false,
    allowRemoteGit: false,
    allowUnsafeShell: true,
    allowSensitiveFiles: false,
  }), /chỉ đọc/);
});

test("admin settings persist only allowlisted values and preserve secrets", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-coder-settings-"));
  const project = path.join(root, "Project with spaces");
  const envFile = path.join(root, ".env");
  await fs.mkdir(project);
  await fs.writeFile(envFile, "MCP_TOKEN=keep-this-secret\nADMIN_TOKEN=keep-admin-secret\nWORKSPACE_PATH=/old\n", { mode: 0o600 });
  try {
    const canonical = await canonicalWorkspace(project);
    await persistAdminSettings(envFile, {
      workspacePath: canonical,
      permissionMode: "workspace-write",
      allowDestructive: true,
      allowRemoteGit: false,
      allowUnsafeShell: false,
      allowSensitiveFiles: false,
    });
    const values = parse(await fs.readFile(envFile, "utf8"));
    assert.equal(values.MCP_TOKEN, "keep-this-secret");
    assert.equal(values.ADMIN_TOKEN, "keep-admin-secret");
    assert.equal(values.WORKSPACE_PATH, canonical);
    assert.equal(values.ALLOW_DESTRUCTIVE, "true");
    assert.equal(values.EXTRA_WORKSPACE_PATHS, "");
    assert.equal((await fs.stat(envFile)).mode & 0o777, 0o600);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("workspace selection rejects broad roots and folder picker commands never use a shell", async () => {
  await assert.rejects(() => canonicalWorkspace(path.parse(process.cwd()).root), /ổ đĩa/);
  assert.deepEqual(buildFolderPickerCommand("darwin"), {
    program: "/usr/bin/osascript",
    args: ["-e", 'POSIX path of (choose folder with prompt "Chọn project cho Local Coder")'],
  });
  assert.equal(buildFolderPickerCommand("freebsd"), undefined);
});
