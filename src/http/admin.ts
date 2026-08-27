import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { AppConfig } from "../config.js";
import { APP_NAME, APP_VERSION, publicConfig } from "../config.js";
import type { AuditLog } from "../infra/audit.js";
import type { CheckpointStore } from "../infra/checkpoints.js";
import type { AdminSettingsInput } from "../services/admin-settings.js";
import { canonicalWorkspace, getRecentWorkspaces, parseAdminSettings, recordRecentWorkspace } from "../services/admin-settings.js";
import { detectProjectTaskPresets } from "../services/task-presets.js";
import { pickWorkspaceFolder } from "../services/folder-picker.js";
import type { TaskRunner } from "../services/task-runner.js";
import type { TunnelManager } from "../services/tunnel-manager.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { authenticateAdminRequest, equalSecret } from "../security/auth.js";
import { rateLimit } from "../security/rate-limit.js";
import { ADMIN_HTML, ADMIN_JS, ADMIN_STYLESHEET, adminLoginHtml } from "./admin-ui.js";

export interface AdminDependencies {
  config: () => AppConfig;
  audit: () => AuditLog;
  checkpoints: () => CheckpointStore;
  tasks: () => TaskRunner;
  sessionCount: () => number;
  sessionStats?: () => { count: number; lastSeen: number | undefined; sessionIds: string[] };
  mcpPort: number;
  startedAt: number;
  tunnel: TunnelManager;
  updateSettings: (settings: AdminSettingsInput) => Promise<AppConfig>;
  pickFolder?: () => Promise<string | undefined>;
  adminHandoffToken?: string;
}

export interface ConnectionTestStep {
  name: string;
  ok: boolean;
  latencyMs?: number;
  detail: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  checkedAt: string;
  summary: string;
  steps: {
    localServer: ConnectionTestStep;
    tunnel: ConnectionTestStep;
    protocol: ConnectionTestStep;
    chatgpt: ConnectionTestStep;
  };
}

async function testConnection(dependencies: AdminDependencies): Promise<ConnectionTestResult> {
  const config = dependencies.config();
  const started = Date.now();

  // 1. Local Server Check
  let localStep: ConnectionTestStep = { name: "Local MCP Server", ok: false, detail: "Không thể kết nối local server" };
  try {
    const t0 = Date.now();
    const res = await fetch(`http://127.0.0.1:${dependencies.mcpPort}/healthz`, { signal: AbortSignal.timeout(3000) });
    const latencyMs = Date.now() - t0;
    if (res.ok) {
      localStep = {
        name: "Local MCP Server",
        ok: true,
        latencyMs,
        detail: `Đang chạy trên cổng ${dependencies.mcpPort} (phản hồi ${latencyMs}ms)`,
      };
    } else {
      localStep = { name: "Local MCP Server", ok: false, detail: `Server trả về HTTP ${res.status}` };
    }
  } catch (error) {
    localStep = { name: "Local MCP Server", ok: false, detail: error instanceof Error ? error.message : "Lỗi kết nối" };
  }

  // 2. Tunnel Reachability Check
  const tunnelStatus = dependencies.tunnel.status();
  let tunnelStep: ConnectionTestStep = {
    name: "Public HTTPS Tunnel",
    ok: false,
    detail: "Tunnel chưa chạy. Bấm 'Mở tunnel' để ChatGPT kết nối từ Internet.",
  };
  if (tunnelStatus.state === "running" && tunnelStatus.publicUrl) {
    try {
      const t0 = Date.now();
      const res = await fetch(`${tunnelStatus.publicUrl}/healthz`, { signal: AbortSignal.timeout(6000) });
      const latencyMs = Date.now() - t0;
      if (res.ok) {
        tunnelStep = {
          name: "Public HTTPS Tunnel",
          ok: true,
          latencyMs,
          detail: `URL public sẵn sàng qua ${tunnelStatus.provider || "tunnel"} (${latencyMs}ms)`,
        };
      } else {
        tunnelStep = {
          name: "Public HTTPS Tunnel",
          ok: false,
          detail: `Tunnel phản hồi HTTP ${res.status}`,
        };
      }
    } catch (error) {
      tunnelStep = {
        name: "Public HTTPS Tunnel",
        ok: false,
        detail: `Không thể gọi tới public URL (${error instanceof Error ? error.message : "Timeout"})`,
      };
    }
  } else if (tunnelStatus.state === "starting") {
    tunnelStep = { name: "Public HTTPS Tunnel", ok: false, detail: "Tunnel đang khởi động, vui lòng thử lại sau vài giây." };
  }

  // 3. Real MCP JSON-RPC handshake. When a public tunnel is active, test the
  // same public path instead of reporting success from localhost only.
  let protocolStep: ConnectionTestStep = { name: "Giao thức MCP", ok: false, detail: "Chưa kiểm tra được giao thức" };
  let testClient: Client | undefined;
  try {
    const t0 = Date.now();
    const usePublic = tunnelStatus.state === "running" && Boolean(tunnelStatus.publicUrl);
    const endpoint = usePublic
      ? `${tunnelStatus.publicUrl}/mcp${config.allowUrlToken ? `/${config.token}` : ""}`
      : `http://127.0.0.1:${dependencies.mcpPort}/mcp`;
    testClient = new Client({ name: "connection-tester", version: APP_VERSION });
    const testTransport = new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: {
        headers: config.allowUrlToken && usePublic ? {} : { Authorization: `Bearer ${config.token}` },
        signal: AbortSignal.timeout(4000),
      },
    });
    await testClient.connect(testTransport as Parameters<Client["connect"]>[0]);
    const latencyMs = Date.now() - t0;
    const serverVersion = testClient.getServerVersion();
    const tools = await testClient.listTools().catch(() => ({ tools: [] }));
    protocolStep = {
      name: "Giao thức MCP",
      ok: true,
      latencyMs,
      detail: `JSON-RPC 2.0 handshake ${usePublic ? "qua public tunnel" : "trên localhost"} thành công (${serverVersion?.name ?? APP_NAME} v${serverVersion?.version ?? APP_VERSION}, ${tools.tools.length} tools)`,
    };
  } catch (error) {
    protocolStep = { name: "Giao thức MCP", ok: false, detail: error instanceof Error ? error.message : "Lỗi bắt tay MCP" };
  } finally {
    await testClient?.close().catch(() => undefined);
  }

  // 4. MCP activity. The transport cannot prove that a session belongs to ChatGPT.
  const stats = dependencies.sessionStats ? dependencies.sessionStats() : { count: dependencies.sessionCount(), lastSeen: undefined };
  const recentEvents = dependencies.audit().recent(5);
  const lastEvent = recentEvents[0];
  let chatgptStep: ConnectionTestStep = {
    name: "Hoạt động MCP gần đây",
    ok: true,
    detail: "Sẵn sàng nhận kết nối từ một MCP client.",
  };
  if (stats.count > 0) {
    const timeAgo = stats.lastSeen ? `${Math.max(1, Math.round((Date.now() - stats.lastSeen) / 1000))}s trước` : "vừa xong";
    chatgptStep = {
      name: "Hoạt động MCP gần đây",
      ok: true,
      detail: `Đang có ${stats.count} phiên MCP (hoạt động ${timeAgo}${lastEvent ? ` · tool gần nhất: ${lastEvent.tool}` : ""}). Không thể xác định client chỉ từ phiên transport.`,
    };
  } else if (lastEvent) {
    const timeAgo = `${Math.max(1, Math.round((Date.now() - new Date(lastEvent.timestamp).getTime()) / 1000))}s trước`;
    chatgptStep = {
      name: "Hoạt động MCP gần đây",
      ok: true,
      detail: `Hiện không có phiên mở (lần gọi tool cuối: ${timeAgo} · ${lastEvent.tool})`,
    };
  } else {
    chatgptStep = {
      name: "Hoạt động MCP gần đây",
      ok: true,
      detail: "Chưa có phiên MCP nào. Kết nối từ ChatGPT hoặc một MCP client để bắt đầu.",
    };
  }

  const publicUrlReady = tunnelStatus.state !== "running" || (tunnelStep.ok && config.allowUrlToken);
  const overallOk = localStep.ok && protocolStep.ok && publicUrlReady;
  let summary = "URL connector đã sẵn sàng để dán vào ChatGPT.";
  if (!localStep.ok || !protocolStep.ok) {
    summary = "Lỗi kết nối Local Server hoặc giao thức MCP.";
  } else if (tunnelStatus.state === "stopped") {
    summary = "Local server tốt. Ưu tiên OpenAI Secure MCP Tunnel để kết nối từ ChatGPT.";
  } else if (!tunnelStep.ok) {
    summary = "Tunnel đang gặp sự cố kết nối từ Internet.";
  } else if (!config.allowUrlToken) {
    summary = "Tunnel hoạt động nhưng URL dán trực tiếp chưa bật xác thực bằng URL token.";
  }

  return {
    ok: overallOk,
    checkedAt: new Date().toISOString(),
    summary,
    steps: {
      localServer: localStep,
      tunnel: tunnelStep,
      protocol: protocolStep,
      chatgpt: chatgptStep,
    },
  };
}

interface DiagnosticCheck {
  name: string;
  ok: boolean;
  detail: string;
}

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => void handler(request, response).catch(next);
}

function settingsPayload(config: AppConfig): Record<string, unknown> {
  return {
    workspacePath: config.primaryRoot,
    permissionMode: config.permissionMode,
    allowUrlToken: config.allowUrlToken,
    autoStartTunnel: config.autoStartTunnel,
    tunnelProvider: config.tunnelProvider,
    cloudflareTunnelToken: config.cloudflareTunnelToken ?? "",
    ngrokAuthToken: config.ngrokAuthToken ?? "",
    ngrokDomain: config.ngrokDomain ?? "",
    persistentTunnelDomain: config.persistentTunnelDomain ?? "",
    autoReconnectTunnel: config.autoReconnectTunnel,
    allowDestructive: config.allowDestructive,
    allowRemoteGit: config.allowRemoteGit,
    allowUnsafeShell: config.allowUnsafeShell,
    allowSensitiveFiles: config.allowSensitiveFiles,
    folderPickerSupported: ["darwin", "win32", "linux"].includes(process.platform),
  };
}

async function diagnostics(dependencies: AdminDependencies): Promise<{ ok: boolean; checkedAt: string; checks: DiagnosticCheck[] }> {
  const config = dependencies.config();
  const checks: DiagnosticCheck[] = [
    { name: "MCP transport", ok: true, detail: `Đang lắng nghe trên cổng ${dependencies.mcpPort}` },
    { name: "Workspace policy", ok: config.workspaceRoots.length > 0, detail: `${config.workspaceRoots.length} workspace root đã cấu hình` },
  ];
  try {
    const tasks = await dependencies.tasks().list();
    checks.push({ name: "Task registry", ok: true, detail: `${tasks.length} task hợp lệ` });
  } catch {
    checks.push({ name: "Task registry", ok: false, detail: "File task không hợp lệ hoặc không đọc được" });
  }
  try {
    const checkpoints = await dependencies.checkpoints().list();
    checks.push({ name: "Checkpoint store", ok: true, detail: `${checkpoints.length} checkpoint đang được giữ` });
  } catch {
    checks.push({ name: "Checkpoint store", ok: false, detail: "Không đọc được checkpoint store" });
  }
  checks.push({
    name: "Quyền rủi ro cao",
    ok: !config.allowUnsafeShell && !config.allowRemoteGit && !config.allowSensitiveFiles,
    detail: config.allowUnsafeShell || config.allowRemoteGit || config.allowSensitiveFiles
      ? "Có capability rủi ro cao đang bật"
      : "Shell, Git remote và file nhạy cảm đang tắt",
  });
  return { ok: checks.every((check) => check.ok), checkedAt: new Date().toISOString(), checks };
}

function requireAdminAction(request: Request, response: Response, next: NextFunction): void {
  if (request.get("x-local-coder-admin") !== "1") {
    response.status(403).json({ error: "admin_action_header_required" });
    return;
  }
  next();
}

export function createAdminApp(dependencies: AdminDependencies): Express {
  const app = express();
  const browserSessions = new Map<string, number>();
  const browserSessionTtlSeconds = 12 * 60 * 60;
  const cookieName = "local_coder_admin";
  const cookieToken = (request: Request): string | undefined => request.headers.cookie
    ?.split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  const pruneSessions = (): void => {
    const now = Date.now();
    for (const [token, expiresAt] of browserSessions) if (expiresAt <= now) browserSessions.delete(token);
    while (browserSessions.size > 8) {
      const oldest = browserSessions.keys().next().value as string | undefined;
      if (!oldest) break;
      browserSessions.delete(oldest);
    }
  };
  const grantBrowserSession = (response: Response): void => {
    pruneSessions();
    const sessionToken = crypto.randomBytes(32).toString("base64url");
    browserSessions.set(sessionToken, Date.now() + browserSessionTtlSeconds * 1000);
    response.setHeader("Set-Cookie", `${cookieName}=${sessionToken}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${browserSessionTtlSeconds}`);
  };
  const requireAdminSession = (request: Request, response: Response, next: NextFunction): void => {
    const config = dependencies.config();
    if (authenticateAdminRequest(request, config.adminToken)) {
      next();
      return;
    }
    pruneSessions();
    const token = cookieToken(request);
    if (token && (browserSessions.get(token) ?? 0) > Date.now()) {
      next();
      return;
    }
    if (request.path.startsWith("/api/")) response.status(401).json({ error: "unauthorized" });
    else response.redirect(303, "/login");
  };

  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    next();
  });
  app.get("/assets/admin.css", (_request, response) => response.type("css").send(ADMIN_STYLESHEET));
  const logoFile = path.resolve(process.cwd(), "src/assets/logo.png");
  const fallbackLogo = path.resolve(process.cwd(), "dist/assets/logo.png");
  const sendLogo = (_request: Request, response: Response) => {
    response.type("png").sendFile(fs.existsSync(logoFile) ? logoFile : fallbackLogo);
  };
  app.get("/assets/logo.png", sendLogo);
  app.get("/assets/logo.jpg", sendLogo);
  app.get("/favicon.ico", sendLogo);
  app.get("/login", (_request, response) => response.type("html").send(adminLoginHtml(false)));
  app.post("/login", rateLimit(10), express.urlencoded({ extended: false, limit: 8 * 1024 }), (request, response) => {
    const candidate = typeof request.body?.token === "string" ? request.body.token : "";
    if (!equalSecret(candidate, dependencies.config().adminToken)) {
      response.status(401).type("html").send(adminLoginHtml(true));
      return;
    }
    grantBrowserSession(response);
    response.redirect(303, "/ui");
  });

  let handoffAvailable = Boolean(dependencies.adminHandoffToken);
  app.get("/bootstrap-session/:token", rateLimit(10), (request, response) => {
    const suppliedToken = Array.isArray(request.params.token) ? request.params.token[0] ?? "" : request.params.token ?? "";
    if (!handoffAvailable || !dependencies.adminHandoffToken
      || !equalSecret(suppliedToken, dependencies.adminHandoffToken)) {
      response.status(404).type("text").send("Liên kết mở app đã hết hạn");
      return;
    }
    handoffAvailable = false;
    grantBrowserSession(response);
    response.redirect(303, "/ui");
  });

  app.use(requireAdminSession);
  app.post("/logout", (request, response) => {
    const token = cookieToken(request);
    if (token) browserSessions.delete(token);
    response.setHeader("Set-Cookie", `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    response.redirect(303, "/login");
  });
  app.get("/", (_request, response) => response.type("html").send(ADMIN_HTML));
  app.get("/ui", (_request, response) => response.type("html").send(ADMIN_HTML));
  app.get("/assets/admin.js", (_request, response) => response.type("js").send(ADMIN_JS));

  app.get("/api/status", (_request, response) => {
    const config = dependencies.config();
    response.json({
      name: APP_NAME,
      version: APP_VERSION,
      startedAt: new Date(dependencies.startedAt).toISOString(),
      uptimeSeconds: Math.max(0, Math.floor((Date.now() - dependencies.startedAt) / 1000)),
      mcpEndpoint: `http://${config.host}:${dependencies.mcpPort}/mcp`,
      sessions: dependencies.sessionCount(),
      config: publicConfig(config),
    });
  });
  app.get("/api/settings", (_request, response) => response.json(settingsPayload(dependencies.config())));
  app.get("/api/tunnel", (_request, response) => response.json(dependencies.tunnel.status()));
  app.get("/api/tasks", asyncRoute(async (_request, response) => {
    response.json({ tasks: await dependencies.tasks().list() });
  }));
  app.get("/api/tasks/presets", asyncRoute(async (_request, response) => {
    const config = dependencies.config();
    const presets = await detectProjectTaskPresets(config.primaryRoot);
    response.json({ presets });
  }));
  app.get("/api/checkpoints", asyncRoute(async (_request, response) => {
    response.json({ checkpoints: await dependencies.checkpoints().list() });
  }));
  app.get("/api/checkpoints/:id/diff", asyncRoute(async (request, response) => {
    const id = request.params.id as string;
    try {
      const diff = await dependencies.checkpoints().getDiff(id);
      response.json(diff);
    } catch (error) {
      response.status(404).json({ error: error instanceof Error ? error.message : "Không tìm thấy checkpoint" });
    }
  }));
  app.get("/api/workspaces/recent", asyncRoute(async (_request, response) => {
    const config = dependencies.config();
    const list = await getRecentWorkspaces(config.stateDir, config.primaryRoot);
    response.json({ workspaces: list });
  }));
  app.get("/api/audit", (_request, response) => response.json({ events: dependencies.audit().recent(100) }));

  app.get("/api/events", (request, response) => {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();

    const onEvent = (event: unknown) => {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const audit = dependencies.audit();
    audit.on("event", onEvent);

    request.on("close", () => {
      audit.off("event", onEvent);
    });
  });

  const json = express.json({ limit: 16 * 1024, strict: true });
  app.post("/api/workspaces/select", requireAdminAction, json, asyncRoute(async (request, response) => {
    const targetPath = typeof request.body?.path === "string" ? request.body.path.trim() : "";
    if (!targetPath) {
      response.status(400).json({ error: "Đường dẫn không hợp lệ" });
      return;
    }
    const current = dependencies.config();
    try {
      const canonical = await canonicalWorkspace(targetPath);
      const updated = await dependencies.updateSettings({
        workspacePath: canonical,
        permissionMode: current.permissionMode,
        allowDestructive: current.allowDestructive,
        allowRemoteGit: current.allowRemoteGit,
        allowUnsafeShell: current.allowUnsafeShell,
        allowSensitiveFiles: current.allowSensitiveFiles,
        tunnelProvider: current.tunnelProvider,
        cloudflareTunnelToken: current.cloudflareTunnelToken,
        ngrokAuthToken: current.ngrokAuthToken,
        ngrokDomain: current.ngrokDomain,
        persistentTunnelDomain: current.persistentTunnelDomain,
        autoReconnectTunnel: current.autoReconnectTunnel,
      });
      await recordRecentWorkspace(current.stateDir, canonical);
      response.json({ ok: true, settings: settingsPayload(updated), sessionsReset: true });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Không thể chọn workspace" });
    }
  }));

  app.post("/api/checkpoints/:id/restore", requireAdminAction, asyncRoute(async (request, response) => {
    const id = request.params.id as string;
    try {
      const restored = await dependencies.checkpoints().restore(id);
      await dependencies.audit().record({
        tool: "admin_restore",
        action: "restore_checkpoint",
        outcome: "ok",
        target: id,
      });
      response.json({ ok: true, restored });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Không thể khôi phục checkpoint" });
    }
  }));

  app.post("/api/tasks/enable-preset", requireAdminAction, json, asyncRoute(async (request, response) => {
    const taskName = typeof request.body?.name === "string" ? request.body.name : "";
    const command = typeof request.body?.command === "string" ? request.body.command : "";
    const args = Array.isArray(request.body?.args) ? (request.body.args as string[]) : [];
    if (!taskName || !command) {
      response.status(400).json({ error: "Thông tin task không hợp lệ" });
      return;
    }
    const config = dependencies.config();
    const tasksFile = path.join(config.stateDir, "tasks.json");
    let currentTasks: Record<string, { program: string; args: string[]; cwd?: string }> = {};
    try {
      currentTasks = JSON.parse(await fs.promises.readFile(tasksFile, "utf8"));
    } catch {}
    currentTasks[taskName] = { program: command, args };
    await fs.promises.mkdir(config.stateDir, { recursive: true, mode: 0o700 });
    await fs.promises.writeFile(tasksFile, JSON.stringify(currentTasks, null, 2), { encoding: "utf8", mode: 0o600 });
    response.json({ ok: true, tasks: await dependencies.tasks().list() });
  }));
  app.post("/api/secret", requireAdminAction, (_request, response) => {
    const tunnel = dependencies.tunnel.status();
    const token = dependencies.config().token;
    response.json({
      mcpToken: token,
      ...(tunnel.publicUrl && dependencies.config().allowUrlToken
        ? { connectorUrl: `${tunnel.publicUrl}/mcp/${token}` }
        : {}),
    });
  });
  app.post("/api/tunnel/start", requireAdminAction, json, asyncRoute(async (request, response) => {
    const config = dependencies.config();
    const provider = typeof request.body?.provider === "string" ? request.body.provider : config.tunnelProvider;
    const cloudflareToken = typeof request.body?.cloudflareToken === "string" ? request.body.cloudflareToken : config.cloudflareTunnelToken;
    const ngrokToken = typeof request.body?.ngrokToken === "string" ? request.body.ngrokToken : config.ngrokAuthToken;
    const ngrokDomain = typeof request.body?.ngrokDomain === "string" ? request.body.ngrokDomain : config.ngrokDomain;
    const persistentDomain = typeof request.body?.persistentDomain === "string" ? request.body.persistentDomain : config.persistentTunnelDomain;
    const autoReconnect = typeof request.body?.autoReconnect === "boolean" ? request.body.autoReconnect : config.autoReconnectTunnel;
    try {
      response.status(202).json(await dependencies.tunnel.start({
        provider,
        port: dependencies.mcpPort,
        cloudflareToken,
        ngrokToken,
        ngrokDomain,
        persistentDomain,
        autoReconnect,
      }));
    } catch (error) {
      response.status(409).json({ error: error instanceof Error ? error.message : "Không thể mở tunnel" });
    }
  }));
  app.post("/api/tunnel/stop", requireAdminAction, asyncRoute(async (_request, response) => {
    response.json(await dependencies.tunnel.stop());
  }));
  app.post("/api/folder-picker", requireAdminAction, asyncRoute(async (_request, response) => {
    const selected = await (dependencies.pickFolder ?? pickWorkspaceFolder)();
    response.json({ selected: selected ?? null });
  }));
  app.post("/api/settings", requireAdminAction, json, asyncRoute(async (request, response) => {
    try {
      const updated = await dependencies.updateSettings(parseAdminSettings(request.body));
      response.json({ ok: true, settings: settingsPayload(updated), sessionsReset: true });
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Không thể lưu cấu hình" });
    }
  }));
  app.post("/api/diagnostics", requireAdminAction, asyncRoute(async (_request, response) => {
    response.json(await diagnostics(dependencies));
  }));
  app.post("/api/test-connection", requireAdminAction, asyncRoute(async (_request, response) => {
    response.json(await testConnection(dependencies));
  }));
  app.use((_error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    response.status(500).json({ error: "admin_request_failed" });
  });
  return app;
}
