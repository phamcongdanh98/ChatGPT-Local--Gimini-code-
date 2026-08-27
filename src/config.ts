import path from "node:path";
import os from "node:os";

export const APP_NAME = "chatgpt-local-secure";
export const APP_VERSION = "3.0.0";

export type PermissionMode = "read-only" | "workspace-write";
export type TunnelProvider = "cloudflared" | "pinggy";

export interface AppConfig {
  host: string;
  port: number;
  token: string;
  allowUrlToken: boolean;
  autoStartTunnel: boolean;
  tunnelProvider: TunnelProvider;
  workspaceRoots: string[];
  primaryRoot: string;
  stateDir: string;
  tasksFile: string;
  permissionMode: PermissionMode;
  allowDestructive: boolean;
  allowRemoteGit: boolean;
  allowUnsafeShell: boolean;
  allowSensitiveFiles: boolean;
  taskTimeoutMs: number;
  readMaxBytes: number;
  writeMaxBytes: number;
  toolOutputMaxBytes: number;
  httpBodyMaxBytes: number;
  rateLimitPerMinute: number;
  sessionTtlMs: number;
  maxSessions: number;
  maxBackgroundTasks: number;
  completedTaskRetention: number;
  auditMaxBytes: number;
  checkpointRetention: number;
  adminEnabled: boolean;
  adminPort: number;
  adminToken: string;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function integer(
  value: string | undefined,
  fallback: number,
  options: { min: number; max: number; name: string }
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < options.min || parsed > options.max) {
    throw new Error(`${options.name} must be an integer between ${options.min} and ${options.max}`);
  }
  return parsed;
}

function permissionMode(value: string | undefined): PermissionMode {
  const normalized = (value || "workspace-write").trim().toLowerCase();
  if (normalized !== "read-only" && normalized !== "workspace-write") {
    throw new Error("PERMISSION_MODE must be read-only or workspace-write");
  }
  return normalized;
}

function tunnelProvider(value: string | undefined): TunnelProvider {
  const normalized = (value || "cloudflared").trim().toLowerCase();
  if (normalized !== "cloudflared" && normalized !== "pinggy") {
    throw new Error("TUNNEL_PROVIDER must be cloudflared or pinggy");
  }
  return normalized;
}

function validateWorkspaceInput(input: string, name: string): string {
  if (!path.isAbsolute(input) || /[\0\r\n]/.test(input)) {
    throw new Error(`${name} must be an absolute path to a specific project directory`);
  }
  const resolved = path.resolve(input);
  if (resolved === path.parse(resolved).root || resolved === path.resolve(os.homedir())) {
    throw new Error(`${name} cannot grant access to an entire drive or the Home directory`);
  }
  return resolved;
}

function workspaceRoots(env: NodeJS.ProcessEnv): string[] {
  const configuredPrimary = env.WORKSPACE_PATH?.trim();
  if (!configuredPrimary) {
    throw new Error("WORKSPACE_PATH is required and must point to a specific project directory");
  }
  const primary = validateWorkspaceInput(configuredPrimary, "WORKSPACE_PATH");
  const extras = (env.EXTRA_WORKSPACE_PATHS || "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => validateWorkspaceInput(entry, "EXTRA_WORKSPACE_PATHS"));
  return [...new Set([primary, ...extras])];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, _cwd = process.cwd()): AppConfig {
  const roots = workspaceRoots(env);
  const primaryRoot = roots[0];
  if (!primaryRoot) throw new Error("At least one workspace root is required");

  const token = (env.MCP_TOKEN || "").trim();
  if (token.length < 32) {
    throw new Error("MCP_TOKEN is required and must contain at least 32 characters; run `pnpm token`");
  }

  const adminEnabled = bool(env.ADMIN_ENABLED, false);
  const adminToken = (env.ADMIN_TOKEN || "").trim();
  if (adminEnabled && adminToken.length < 32) {
    throw new Error("ADMIN_TOKEN must contain at least 32 characters when ADMIN_ENABLED=true");
  }

  const stateDir = path.resolve(env.STATE_DIR?.trim() || path.join(primaryRoot, ".local-coder"));
  const tasksFile = path.resolve(env.TASKS_FILE?.trim() || path.join(stateDir, "tasks.json"));
  const tasksRelative = path.relative(stateDir, tasksFile);
  if (tasksRelative.startsWith(`..${path.sep}`) || path.isAbsolute(tasksRelative)) {
    throw new Error("TASKS_FILE must be inside STATE_DIR so MCP file tools cannot modify the task registry");
  }

  return {
    host: env.HOST?.trim() || "127.0.0.1",
    port: integer(env.PORT, 3000, { min: 0, max: 65535, name: "PORT" }),
    token,
    allowUrlToken: bool(env.ALLOW_URL_TOKEN, false),
    autoStartTunnel: bool(env.AUTO_START_TUNNEL, false),
    tunnelProvider: tunnelProvider(env.TUNNEL_PROVIDER),
    workspaceRoots: roots,
    primaryRoot,
    stateDir,
    tasksFile,
    permissionMode: permissionMode(env.PERMISSION_MODE),
    allowDestructive: bool(env.ALLOW_DESTRUCTIVE, false),
    allowRemoteGit: bool(env.ALLOW_REMOTE_GIT, false),
    allowUnsafeShell: bool(env.ALLOW_UNSAFE_SHELL, false),
    allowSensitiveFiles: bool(env.ALLOW_SENSITIVE_FILES, false),
    taskTimeoutMs:
      integer(env.TASK_TIMEOUT_SECONDS, 300, {
        min: 1,
        max: 3600,
        name: "TASK_TIMEOUT_SECONDS",
      }) * 1000,
    readMaxBytes: integer(env.READ_MAX_BYTES, 512 * 1024, {
      min: 1024,
      max: 8 * 1024 * 1024,
      name: "READ_MAX_BYTES",
    }),
    writeMaxBytes: integer(env.WRITE_MAX_BYTES, 1024 * 1024, {
      min: 1024,
      max: 16 * 1024 * 1024,
      name: "WRITE_MAX_BYTES",
    }),
    toolOutputMaxBytes: integer(env.TOOL_OUTPUT_MAX_BYTES, 256 * 1024, {
      min: 4096,
      max: 2 * 1024 * 1024,
      name: "TOOL_OUTPUT_MAX_BYTES",
    }),
    httpBodyMaxBytes: integer(env.HTTP_BODY_MAX_BYTES, 1024 * 1024, {
      min: 16 * 1024,
      max: 8 * 1024 * 1024,
      name: "HTTP_BODY_MAX_BYTES",
    }),
    rateLimitPerMinute: integer(env.RATE_LIMIT_PER_MINUTE, 120, {
      min: 10,
      max: 5000,
      name: "RATE_LIMIT_PER_MINUTE",
    }),
    sessionTtlMs:
      integer(env.SESSION_TTL_SECONDS, 1800, {
        min: 60,
        max: 86400,
        name: "SESSION_TTL_SECONDS",
      }) * 1000,
    maxSessions: integer(env.MAX_SESSIONS, 16, {
      min: 1,
      max: 128,
      name: "MAX_SESSIONS",
    }),
    maxBackgroundTasks: integer(env.MAX_BACKGROUND_TASKS, 4, {
      min: 1,
      max: 32,
      name: "MAX_BACKGROUND_TASKS",
    }),
    completedTaskRetention: integer(env.COMPLETED_TASK_RETENTION, 50, {
      min: 1,
      max: 500,
      name: "COMPLETED_TASK_RETENTION",
    }),
    auditMaxBytes: integer(env.AUDIT_MAX_BYTES, 5 * 1024 * 1024, {
      min: 64 * 1024,
      max: 100 * 1024 * 1024,
      name: "AUDIT_MAX_BYTES",
    }),
    checkpointRetention: integer(env.CHECKPOINT_RETENTION, 25, {
      min: 1,
      max: 200,
      name: "CHECKPOINT_RETENTION",
    }),
    adminEnabled,
    adminPort: integer(env.ADMIN_PORT, 3001, { min: 0, max: 65535, name: "ADMIN_PORT" }),
    adminToken,
  };
}

export function publicConfig(config: AppConfig): Record<string, unknown> {
  return {
    name: APP_NAME,
    version: APP_VERSION,
    permissionMode: config.permissionMode,
    rootCount: config.workspaceRoots.length,
    capabilities: {
      write: config.permissionMode === "workspace-write",
      destructive: config.permissionMode === "workspace-write" && config.allowDestructive,
      remoteGit: config.permissionMode === "workspace-write" && config.allowRemoteGit,
      unsafeShell: config.permissionMode === "workspace-write" && config.allowUnsafeShell,
      sensitiveFiles: config.permissionMode === "workspace-write" && config.allowSensitiveFiles,
    },
    limits: {
      readMaxBytes: config.readMaxBytes,
      writeMaxBytes: config.writeMaxBytes,
      outputMaxBytes: config.toolOutputMaxBytes,
      taskTimeoutMs: config.taskTimeoutMs,
      maxSessions: config.maxSessions,
      maxBackgroundTasks: config.maxBackgroundTasks,
    },
  };
}
