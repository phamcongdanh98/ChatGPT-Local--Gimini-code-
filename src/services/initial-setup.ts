import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { PermissionMode } from "../config.js";
import { canonicalWorkspace } from "./admin-settings.js";

export interface InitialSetupInput {
  workspacePath: string;
  permissionMode: PermissionMode;
}

export interface InitialSetupResult {
  workspacePath: string;
}

export async function createInitialConfiguration(
  projectRoot: string,
  input: InitialSetupInput,
): Promise<InitialSetupResult> {
  if (input.permissionMode !== "read-only" && input.permissionMode !== "workspace-write") {
    throw new Error("Hãy chọn quyền chỉ đọc hoặc đọc và sửa code");
  }
  const workspace = await canonicalWorkspace(input.workspacePath.trim());
  const envPath = path.join(projectRoot, ".env");
  const existing = await fs.lstat(envPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (existing) throw new Error("Ứng dụng đã được thiết lập; hãy mở lại app");

  const stateDir = path.join(workspace, ".local-coder");
  const tasksPath = path.join(stateDir, "tasks.json");
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  const tasksExist = await fs.stat(tasksPath).then(() => true).catch(() => false);
  if (!tasksExist) {
    await fs.copyFile(path.join(projectRoot, "profiles", "tasks.example.json"), tasksPath);
    await fs.chmod(tasksPath, 0o600).catch(() => undefined);
  }

  const mcpToken = crypto.randomBytes(32).toString("base64url");
  const adminToken = crypto.randomBytes(32).toString("base64url");
  const environment = [
    `MCP_TOKEN=${mcpToken}`,
    `WORKSPACE_PATH=${JSON.stringify(workspace)}`,
    "HOST=127.0.0.1",
    "PORT=3000",
    "ALLOW_URL_TOKEN=false",
    "AUTO_START_TUNNEL=false",
    "TUNNEL_PROVIDER=cloudflared",
    `PERMISSION_MODE=${input.permissionMode}`,
    "ALLOW_DESTRUCTIVE=false",
    "ALLOW_REMOTE_GIT=false",
    "ALLOW_UNSAFE_SHELL=false",
    "ALLOW_SENSITIVE_FILES=false",
    "ADMIN_ENABLED=true",
    "ADMIN_PORT=3001",
    `ADMIN_TOKEN=${adminToken}`,
    "",
  ].join("\n");
  await fs.writeFile(envPath, environment, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await fs.chmod(envPath, 0o600).catch(() => undefined);
  return { workspacePath: workspace };
}
