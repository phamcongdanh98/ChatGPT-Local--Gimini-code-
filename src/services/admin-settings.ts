import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PermissionMode, TunnelProvider } from "../config.js";

export interface AdminSettingsInput {
  workspacePath: string;
  permissionMode: PermissionMode;
  allowDestructive: boolean;
  allowRemoteGit: boolean;
  allowUnsafeShell: boolean;
  allowSensitiveFiles: boolean;
  tunnelProvider?: TunnelProvider | undefined;
  cloudflareTunnelToken?: string | undefined;
  ngrokAuthToken?: string | undefined;
  ngrokDomain?: string | undefined;
  persistentTunnelDomain?: string | undefined;
  autoReconnectTunnel?: boolean | undefined;
}

export interface RecentWorkspaceItem {
  name: string;
  path: string;
  isCurrent: boolean;
  exists: boolean;
  lastOpenedAt: string;
}

const SETTINGS_KEYS = [
  "WORKSPACE_PATH",
  "EXTRA_WORKSPACE_PATHS",
  "PERMISSION_MODE",
  "ALLOW_DESTRUCTIVE",
  "ALLOW_REMOTE_GIT",
  "ALLOW_UNSAFE_SHELL",
  "ALLOW_SENSITIVE_FILES",
  "TUNNEL_PROVIDER",
  "CLOUDFLARE_TUNNEL_TOKEN",
  "NGROK_AUTHTOKEN",
  "NGROK_DOMAIN",
  "PERSISTENT_TUNNEL_DOMAIN",
  "AUTO_RECONNECT_TUNNEL",
] as const;

function exactBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} phải là true hoặc false`);
  return value;
}

export function parseAdminSettings(value: unknown): AdminSettingsInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Cấu hình không hợp lệ");
  const input = value as Record<string, unknown>;
  if (typeof input.workspacePath !== "string" || input.workspacePath.length < 1 || input.workspacePath.length > 4096) {
    throw new Error("Workspace path không hợp lệ");
  }
  const permissionMode = input.permissionMode;
  if (permissionMode !== "read-only" && permissionMode !== "workspace-write") {
    throw new Error("Chế độ quyền không hợp lệ");
  }
  const settings: AdminSettingsInput = {
    workspacePath: input.workspacePath.trim(),
    permissionMode,
    allowDestructive: exactBoolean(input.allowDestructive, "allowDestructive"),
    allowRemoteGit: exactBoolean(input.allowRemoteGit, "allowRemoteGit"),
    allowUnsafeShell: exactBoolean(input.allowUnsafeShell, "allowUnsafeShell"),
    allowSensitiveFiles: exactBoolean(input.allowSensitiveFiles, "allowSensitiveFiles"),
    ...(typeof input.tunnelProvider === "string" && ["cloudflared", "pinggy", "ngrok"].includes(input.tunnelProvider)
      ? { tunnelProvider: input.tunnelProvider as TunnelProvider }
      : {}),
    ...(typeof input.cloudflareTunnelToken === "string" ? { cloudflareTunnelToken: input.cloudflareTunnelToken.trim() } : {}),
    ...(typeof input.ngrokAuthToken === "string" ? { ngrokAuthToken: input.ngrokAuthToken.trim() } : {}),
    ...(typeof input.ngrokDomain === "string" ? { ngrokDomain: input.ngrokDomain.trim() } : {}),
    ...(typeof input.persistentTunnelDomain === "string" ? { persistentTunnelDomain: input.persistentTunnelDomain.trim() } : {}),
    ...(typeof input.autoReconnectTunnel === "boolean" ? { autoReconnectTunnel: input.autoReconnectTunnel } : {}),
  };
  if (settings.permissionMode === "read-only" && (
    settings.allowDestructive || settings.allowRemoteGit || settings.allowUnsafeShell || settings.allowSensitiveFiles
  )) throw new Error("Chế độ chỉ đọc không thể bật quyền rủi ro cao");
  return settings;
}

export async function canonicalWorkspace(input: string): Promise<string> {
  if (!path.isAbsolute(input) || /[\0\r\n]/.test(input)) throw new Error("Hãy chọn đường dẫn tuyệt đối tới project");
  const canonical = await fs.realpath(input);
  const stat = await fs.stat(canonical);
  if (!stat.isDirectory()) throw new Error("Workspace phải là một thư mục đang tồn tại");
  const root = path.parse(canonical).root;
  const home = await fs.realpath(os.homedir()).catch(() => os.homedir());
  if (canonical === root || canonical === home) throw new Error("Không được cấp quyền cho toàn bộ ổ đĩa hoặc thư mục Home");
  return canonical;
}

function dotenvValue(value: string): string {
  return JSON.stringify(value);
}

export async function persistAdminSettings(
  envFile: string,
  settings: AdminSettingsInput,
): Promise<void> {
  const stat = await fs.lstat(envFile);
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("File .env phải là file thường, không phải symlink");
  const original = await fs.readFile(envFile, "utf8");
  const values: Record<(typeof SETTINGS_KEYS)[number], string> = {
    WORKSPACE_PATH: dotenvValue(settings.workspacePath),
    EXTRA_WORKSPACE_PATHS: "",
    PERMISSION_MODE: settings.permissionMode,
    ALLOW_DESTRUCTIVE: String(settings.allowDestructive),
    ALLOW_REMOTE_GIT: String(settings.allowRemoteGit),
    ALLOW_UNSAFE_SHELL: String(settings.allowUnsafeShell),
    ALLOW_SENSITIVE_FILES: String(settings.allowSensitiveFiles),
    TUNNEL_PROVIDER: settings.tunnelProvider || "cloudflared",
    CLOUDFLARE_TUNNEL_TOKEN: settings.cloudflareTunnelToken ?? "",
    NGROK_AUTHTOKEN: settings.ngrokAuthToken ?? "",
    NGROK_DOMAIN: settings.ngrokDomain ?? "",
    PERSISTENT_TUNNEL_DOMAIN: settings.persistentTunnelDomain ?? "",
    AUTO_RECONNECT_TUNNEL: String(settings.autoReconnectTunnel ?? true),
  };
  const found = new Set<string>();
  const lines = original.split(/\r?\n/).map((line) => {
    const match = /^([A-Z_][A-Z0-9_]*)=/.exec(line);
    const key = match?.[1];
    if (!key || !SETTINGS_KEYS.includes(key as (typeof SETTINGS_KEYS)[number])) return line;
    found.add(key);
    return `${key}=${values[key as (typeof SETTINGS_KEYS)[number]]}`;
  });
  for (const key of SETTINGS_KEYS) if (!found.has(key)) lines.push(`${key}=${values[key]}`);
  const output = `${lines.join("\n").replace(/\n+$/, "")}\n`;
  const temporary = `${envFile}.tmp-${crypto.randomUUID()}`;
  try {
    await fs.writeFile(temporary, output, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await fs.rename(temporary, envFile);
    await fs.chmod(envFile, 0o600).catch(() => undefined);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

const RECENT_WORKSPACES_FILE = "recent-workspaces.json";

export async function getRecentWorkspaces(stateDir: string, currentPrimary: string): Promise<RecentWorkspaceItem[]> {
  const filePath = path.join(stateDir, RECENT_WORKSPACES_FILE);
  let list: Array<{ path: string; lastOpenedAt: string }> = [];
  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) list = parsed;
  } catch {}

  if (currentPrimary && !list.some((item) => item.path === currentPrimary)) {
    list.unshift({ path: currentPrimary, lastOpenedAt: new Date().toISOString() });
  }

  const items: RecentWorkspaceItem[] = [];
  for (const entry of list) {
    let exists = false;
    try {
      const stat = await fs.stat(entry.path);
      exists = stat.isDirectory();
    } catch {}

    items.push({
      name: path.basename(entry.path),
      path: entry.path,
      isCurrent: entry.path === currentPrimary,
      exists,
      lastOpenedAt: entry.lastOpenedAt || new Date().toISOString(),
    });
  }

  return items.slice(0, 10);
}

export async function recordRecentWorkspace(stateDir: string, workspacePath: string): Promise<void> {
  const filePath = path.join(stateDir, RECENT_WORKSPACES_FILE);
  let list: Array<{ path: string; lastOpenedAt: string }> = [];
  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) list = parsed;
  } catch {}

  list = list.filter((item) => item.path !== workspacePath);
  list.unshift({ path: workspacePath, lastOpenedAt: new Date().toISOString() });
  list = list.slice(0, 10);

  try {
    await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(filePath, JSON.stringify(list, null, 2), { encoding: "utf8", mode: 0o600 });
  } catch {}
}
