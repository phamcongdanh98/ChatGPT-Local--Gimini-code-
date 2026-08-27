import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { AppConfig } from "../config.js";
import { APP_NAME, APP_VERSION, loadConfig } from "../config.js";
import { AuditLog } from "../infra/audit.js";
import { CheckpointStore } from "../infra/checkpoints.js";
import { createMcpServer } from "../mcp/tools.js";
import { McpSessionManager } from "../mcp/session-manager.js";
import { PathPolicy } from "../security/path-policy.js";
import { requireToken } from "../security/auth.js";
import { rateLimit } from "../security/rate-limit.js";
import type { AdminSettingsInput } from "../services/admin-settings.js";
import { canonicalWorkspace, persistAdminSettings } from "../services/admin-settings.js";
import { FileService } from "../services/files.js";
import { GitService } from "../services/git.js";
import { TaskRunner } from "../services/task-runner.js";
import { TunnelManager } from "../services/tunnel-manager.js";
import { createAdminApp } from "./admin.js";

export interface RunningApplication {
  port: number;
  adminPort?: number;
  sessionCount: () => number;
  close: () => Promise<void>;
}

export interface ApplicationOptions {
  envFile?: string;
  tunnel?: TunnelManager;
  pickFolder?: () => Promise<string | undefined>;
  adminHandoffToken?: string;
}

interface RuntimeServices {
  audit: AuditLog;
  checkpoints: CheckpointStore;
  tasks: TaskRunner;
  sessions: McpSessionManager;
}

function secureHeaders(app: Express): void {
  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Frame-Options", "DENY");
    next();
  });
}

async function listen(server: http.Server, port: number, host: string): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server did not expose a TCP port");
  return address.port;
}

async function closeHttp(server: http.Server | undefined): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function createRuntime(config: AppConfig): Promise<RuntimeServices> {
  const policy = await PathPolicy.create(config.workspaceRoots, config.stateDir, config.allowSensitiveFiles);
  await fs.mkdir(config.stateDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(path.join(config.stateDir, "runtime-home"), { recursive: true, mode: 0o700 });
  const audit = new AuditLog(config.stateDir, 250, config.auditMaxBytes);
  await audit.initialize();
  const checkpoints = new CheckpointStore(config.stateDir, policy, config.checkpointRetention);
  await checkpoints.initialize();
  const files = new FileService(policy, checkpoints, config.readMaxBytes, config.writeMaxBytes);
  const tasks = new TaskRunner(
    config.tasksFile,
    config.stateDir,
    policy,
    config.taskTimeoutMs,
    config.toolOutputMaxBytes,
    config.maxBackgroundTasks,
    config.completedTaskRetention,
  );
  const git = new GitService(policy, config.stateDir, config.taskTimeoutMs, config.toolOutputMaxBytes);
  const sessions = new McpSessionManager(
    () => createMcpServer({ config, policy, audit, checkpoints, files, git, tasks }),
    config.sessionTtlMs,
    config.maxSessions,
  );
  return { audit, checkpoints, tasks, sessions };
}

async function closeRuntime(runtime: RuntimeServices): Promise<void> {
  await runtime.tasks.shutdown();
  await runtime.sessions.close();
}

function environmentForSettings(config: AppConfig, settings: AdminSettingsInput): NodeJS.ProcessEnv {
  return {
    ...process.env,
    MCP_TOKEN: config.token,
    WORKSPACE_PATH: settings.workspacePath,
    EXTRA_WORKSPACE_PATHS: "",
    STATE_DIR: "",
    TASKS_FILE: "",
    HOST: config.host,
    PORT: String(config.port),
    ALLOW_URL_TOKEN: String(config.allowUrlToken),
    AUTO_START_TUNNEL: String(config.autoStartTunnel),
    TUNNEL_PROVIDER: settings.tunnelProvider || config.tunnelProvider,
    CLOUDFLARE_TUNNEL_TOKEN: settings.cloudflareTunnelToken ?? config.cloudflareTunnelToken ?? "",
    NGROK_AUTHTOKEN: settings.ngrokAuthToken ?? config.ngrokAuthToken ?? "",
    NGROK_DOMAIN: settings.ngrokDomain ?? config.ngrokDomain ?? "",
    PERSISTENT_TUNNEL_DOMAIN: settings.persistentTunnelDomain ?? config.persistentTunnelDomain ?? "",
    AUTO_RECONNECT_TUNNEL: String(settings.autoReconnectTunnel ?? config.autoReconnectTunnel),
    PERMISSION_MODE: settings.permissionMode,
    ALLOW_DESTRUCTIVE: String(settings.allowDestructive),
    ALLOW_REMOTE_GIT: String(settings.allowRemoteGit),
    ALLOW_UNSAFE_SHELL: String(settings.allowUnsafeShell),
    ALLOW_SENSITIVE_FILES: String(settings.allowSensitiveFiles),
    TASK_TIMEOUT_SECONDS: String(config.taskTimeoutMs / 1000),
    READ_MAX_BYTES: String(config.readMaxBytes),
    WRITE_MAX_BYTES: String(config.writeMaxBytes),
    TOOL_OUTPUT_MAX_BYTES: String(config.toolOutputMaxBytes),
    HTTP_BODY_MAX_BYTES: String(config.httpBodyMaxBytes),
    RATE_LIMIT_PER_MINUTE: String(config.rateLimitPerMinute),
    SESSION_TTL_SECONDS: String(config.sessionTtlMs / 1000),
    MAX_SESSIONS: String(config.maxSessions),
    MAX_BACKGROUND_TASKS: String(config.maxBackgroundTasks),
    COMPLETED_TASK_RETENTION: String(config.completedTaskRetention),
    AUDIT_MAX_BYTES: String(config.auditMaxBytes),
    CHECKPOINT_RETENTION: String(config.checkpointRetention),
    ADMIN_ENABLED: String(config.adminEnabled),
    ADMIN_PORT: String(config.adminPort),
    ADMIN_TOKEN: config.adminToken,
  };
}

export async function startApplication(config: AppConfig, options: ApplicationOptions = {}): Promise<RunningApplication> {
  const startedAt = Date.now();
  const envFile = path.resolve(options.envFile ?? (process.env.DOTENV_CONFIG_PATH?.trim() || path.join(process.cwd(), ".env")));
  const tunnel = options.tunnel ?? new TunnelManager();
  let activeConfig = config;
  let runtime = await createRuntime(config);
  let updateQueue = Promise.resolve();
  let reconfiguring = false;

  const app = express();
  secureHeaders(app);
  app.get("/healthz", (_request, response) => response.json({ status: "ok", name: APP_NAME, version: APP_VERSION }));
  const limiter = rateLimit(config.rateLimitPerMinute);
  const parser = express.json({ limit: config.httpBodyMaxBytes, strict: true });
  const authenticate = (request: Request, response: Response, next: NextFunction): void => {
    if (request.params.token && !activeConfig.allowUrlToken) {
      response.status(404).json({ error: "not_found" });
      return;
    }
    requireToken(activeConfig.token, activeConfig.allowUrlToken)(request, response, next);
  };
  const handler = {
    post: async (request: Request, response: Response, next: NextFunction) => {
      if (reconfiguring) { response.status(503).json({ error: "runtime_reconfiguring" }); return; }
      try { await runtime.sessions.post(request, response); } catch (error) { next(error); }
    },
    get: async (request: Request, response: Response, next: NextFunction) => {
      if (reconfiguring) { response.status(503).json({ error: "runtime_reconfiguring" }); return; }
      try { await runtime.sessions.get(request, response); } catch (error) { next(error); }
    },
    delete: async (request: Request, response: Response, next: NextFunction) => {
      if (reconfiguring) { response.status(503).json({ error: "runtime_reconfiguring" }); return; }
      try { await runtime.sessions.delete(request, response); } catch (error) { next(error); }
    },
  };
  for (const route of ["/mcp", "/mcp/:token"]) {
    app.post(route, limiter, authenticate, parser, handler.post);
    app.get(route, limiter, authenticate, handler.get);
    app.delete(route, limiter, authenticate, handler.delete);
  }
  app.use((error: unknown, _request: Request, response: Response, _next: (error?: unknown) => void) => {
    const status = (error as { status?: number }).status === 413 ? 413 : 400;
    response.status(status).json({ error: status === 413 ? "request_too_large" : "invalid_request" });
  });

  const httpServer = http.createServer(app);
  const port = await listen(httpServer, config.port, config.host);
  let adminServer: http.Server | undefined;
  let adminPort: number | undefined;

  const updateSettings = async (settings: AdminSettingsInput): Promise<AppConfig> => {
    let result!: AppConfig;
    const operation = updateQueue.then(async () => {
      reconfiguring = true;
      try {
        const workspacePath = await canonicalWorkspace(settings.workspacePath);
        const normalized = { ...settings, workspacePath };
        const nextConfig = loadConfig(environmentForSettings(activeConfig, normalized), process.cwd());
        const nextRuntime = await createRuntime(nextConfig);
        try {
          await persistAdminSettings(envFile, normalized);
        } catch (error) {
          await closeRuntime(nextRuntime);
          throw error;
        }
        const previous = runtime;
        await closeRuntime(previous);
        activeConfig = nextConfig;
        runtime = nextRuntime;
        process.env.WORKSPACE_PATH = workspacePath;
        process.env.EXTRA_WORKSPACE_PATHS = "";
        process.env.PERMISSION_MODE = normalized.permissionMode;
        process.env.ALLOW_DESTRUCTIVE = String(normalized.allowDestructive);
        process.env.ALLOW_REMOTE_GIT = String(normalized.allowRemoteGit);
        process.env.ALLOW_UNSAFE_SHELL = String(normalized.allowUnsafeShell);
        process.env.ALLOW_SENSITIVE_FILES = String(normalized.allowSensitiveFiles);
        result = nextConfig;
      } finally {
        reconfiguring = false;
      }
    });
    updateQueue = operation.then(() => undefined, () => undefined);
    await operation;
    return result;
  };

  try {
    if (config.adminEnabled) {
      adminServer = http.createServer(createAdminApp({
        config: () => activeConfig,
        audit: () => runtime.audit,
        checkpoints: () => runtime.checkpoints,
        tasks: () => runtime.tasks,
        sessionCount: () => runtime.sessions.size,
        sessionStats: () => runtime.sessions.getStats(),
        mcpPort: port,
        startedAt,
        tunnel,
        updateSettings,
        ...(options.pickFolder ? { pickFolder: options.pickFolder } : {}),
        ...(options.adminHandoffToken ? { adminHandoffToken: options.adminHandoffToken } : {}),
      }));
      adminPort = await listen(adminServer, config.adminPort, "127.0.0.1");
    }
    if (config.autoStartTunnel) {
      const hasCustomOptions = Boolean(
        config.cloudflareTunnelToken || config.ngrokAuthToken || config.ngrokDomain || config.persistentTunnelDomain || !config.autoReconnectTunnel
      );
      if (hasCustomOptions) {
        await tunnel.start({
          provider: config.tunnelProvider,
          port,
          cloudflareToken: config.cloudflareTunnelToken,
          ngrokToken: config.ngrokAuthToken,
          ngrokDomain: config.ngrokDomain,
          persistentDomain: config.persistentTunnelDomain,
          autoReconnect: config.autoReconnectTunnel,
        }).catch(() => undefined);
      } else {
        await tunnel.start(config.tunnelProvider, port).catch(() => undefined);
      }
    }
  } catch (error) {
    await closeHttp(httpServer);
    await closeRuntime(runtime);
    await tunnel.shutdown();
    throw error;
  }

  return {
    port,
    ...(adminPort !== undefined ? { adminPort } : {}),
    sessionCount: () => runtime.sessions.size,
    close: async () => {
      await tunnel.shutdown();
      await closeRuntime(runtime);
      await Promise.all([closeHttp(httpServer), closeHttp(adminServer)]);
    },
  };
}
