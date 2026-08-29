import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { buildTunnelCommand, ensureNgrokTokenConfig, parseTunnelProvider, tunnelEnvironment, type TunnelProvider } from "../cli/tunnel.js";

export type TunnelState = "stopped" | "starting" | "running" | "stopping" | "failed";

export interface TunnelStatus {
  state: TunnelState;
  provider?: TunnelProvider | undefined;
  publicUrl?: string | undefined;
  startedAt?: string | undefined;
  error?: string | undefined;
}

export interface TunnelStartOptions {
  provider?: string | undefined;
  port: number;
  cloudflareToken?: string | undefined;
  ngrokToken?: string | undefined;
  ngrokDomain?: string | undefined;
  pinggyToken?: string | undefined;
  persistentDomain?: string | undefined;
  autoReconnect?: boolean | undefined;
}

type TunnelChild = ChildProcessByStdio<null, Readable, Readable>;
export type TunnelSpawner = (
  command: string,
  args: string[],
  options: Parameters<typeof spawn>[2],
) => TunnelChild;

const defaultSpawner: TunnelSpawner = (command, args, options) => spawn(command, args, options) as TunnelChild;

export function extractTunnelUrl(output: string, provider: TunnelProvider, persistentDomain?: string): string | undefined {
  if (persistentDomain) {
    const cleaned = persistentDomain.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    if (cleaned) return `https://${cleaned}`;
  }
  const plain = output.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, " ");
  for (const match of plain.matchAll(/https:\/\/[^\s"'<>\]]+/gi)) {
    try {
      const candidate = new URL(match[0].replace(/[),.;]+$/, ""));
      const host = candidate.hostname.toLowerCase();
      let allowed = false;
      if (provider === "pinggy") {
        allowed = host === "pinggy.io" || host.endsWith(".pinggy.io") || host === "pinggy.link" || host.endsWith(".pinggy.link");
      } else if (provider === "ngrok") {
        allowed = host.endsWith(".ngrok-free.app") || host.endsWith(".ngrok.app") || host.endsWith(".ngrok.io") || host.endsWith(".ngrok-free.dev");
      } else {
        allowed = host === "trycloudflare.com" || host.endsWith(".trycloudflare.com") || host.endsWith(".cfargotunnel.com");
      }
      if (allowed && candidate.protocol === "https:") return candidate.origin;
    } catch {
      // Ignore malformed URLs in provider output.
    }
  }
  return undefined;
}

export function extractTunnelError(output: string, provider: TunnelProvider): string | undefined {
  const plain = output.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, " ");
  const errMatch = /err="([^"]+)"/i.exec(plain) || /ERROR:\s+([^\n\r]+)/i.exec(plain) || /ERR_NGROK_\d+:[^\n\r]+/i.exec(plain);
  if (errMatch) {
    const raw = (errMatch[1] || errMatch[0] || "").replace(/\\n/g, " ").replace(/\\r/g, "").trim();
    if (raw) return raw.slice(0, 250);
  }
  return undefined;
}

export class TunnelManager {
  private child: TunnelChild | undefined;
  private current: TunnelStatus = { state: "stopped" };
  private output = "";
  private startupTimer: NodeJS.Timeout | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private reconnectAttempts = 0;
  private lastStartOptions: TunnelStartOptions | undefined;
  private manualStop = false;

  constructor(
    private readonly startupTimeoutMs = 25_000,
    private readonly spawnTunnel: TunnelSpawner = defaultSpawner,
  ) {}

  status(): TunnelStatus {
    return { ...this.current };
  }

  async start(
    providerOrOptions: string | TunnelStartOptions | undefined,
    portInput?: number,
  ): Promise<TunnelStatus> {
    this.clearReconnectTimer();
    this.manualStop = false;

    const options: TunnelStartOptions = typeof providerOrOptions === "object" && providerOrOptions !== null
      ? providerOrOptions
      : { provider: providerOrOptions, port: portInput ?? 3000 };

    this.lastStartOptions = options;

    if (this.child) {
      if (this.current.state === "running") return this.status();
      await this.stop();
    }

    const provider = parseTunnelProvider(options.provider);
    if (provider === "ngrok") {
      const token = options.ngrokToken || process.env.NGROK_AUTHTOKEN;
      if (token) {
        await ensureNgrokTokenConfig(token);
      }
      try {
        const { exec } = await import("node:child_process");
        if (process.platform === "win32") {
          exec("taskkill /F /IM ngrok.exe");
        } else {
          exec("pkill -9 -f ngrok");
        }
        await new Promise((r) => setTimeout(r, 250));
      } catch {}
    }
    const command = buildTunnelCommand(provider, options.port, {
      cloudflareToken: options.cloudflareToken,
      ngrokToken: options.ngrokToken,
      ngrokDomain: options.ngrokDomain,
      pinggyToken: options.pinggyToken,
    });

    this.output = "";
    const isNamedCloudflare = provider === "cloudflared" && Boolean(options.cloudflareToken || process.env.CLOUDFLARE_TUNNEL_TOKEN);
    const hasStaticUrl = options.persistentDomain || (provider === "ngrok" && (options.ngrokDomain || process.env.NGROK_DOMAIN));

    const initialUrl = hasStaticUrl
      ? extractTunnelUrl("", provider, options.persistentDomain || (options.ngrokDomain || process.env.NGROK_DOMAIN))
      : undefined;

    this.current = {
      state: initialUrl ? "running" : "starting",
      provider,
      startedAt: new Date().toISOString(),
      ...(initialUrl ? { publicUrl: initialUrl } : {}),
    };

    const spawnEnv = tunnelEnvironment(process.env);
    if (process.platform === "darwin" && spawnEnv.PATH) {
      const paths = spawnEnv.PATH.split(":");
      for (const p of ["/opt/homebrew/bin", "/usr/local/bin"]) {
        if (!paths.includes(p)) paths.unshift(p);
      }
      spawnEnv.PATH = paths.join(":");
    }

    const child = this.spawnTunnel(command.command, command.args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: spawnEnv,
      windowsHide: true,
    });
    this.child = child;

    const inspect = (chunk: Buffer): void => {
      if (this.output.length < 32 * 1024) this.output += chunk.toString("utf8").slice(0, 32 * 1024 - this.output.length);
      const publicUrl = extractTunnelUrl(this.output, provider, options.persistentDomain);
      if (publicUrl) {
        this.clearStartupTimer();
        this.reconnectAttempts = 0;
        this.current = { ...this.current, state: "running", publicUrl };
      }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("close", (code, signal) => {
      if (this.child !== child) return;
      this.clearStartupTimer();
      this.child = undefined;
      const lastOutput = this.output;
      this.output = "";

      if (this.current.state === "failed") {
        this.current = { ...this.current };
        return;
      }

      const expectedClose = this.manualStop || this.current.state === "stopping" || signal || code === 0 || code === 130;
      if (expectedClose) {
        this.current = { state: "stopped" };
        return;
      }

      const specificError = extractTunnelError(lastOutput, provider);
      this.current = {
        state: "failed",
        provider,
        error: specificError || `${provider} đã dừng (exit ${code ?? "unknown"})`,
      };

      // Auto reconnect if enabled and not manually stopped and not auth error
      const isAuthError = Boolean(specificError && /authtoken|authentication|credentials|not authenticated|ERR_NGROK_4018|ERR_NGROK_105/i.test(specificError));
      const shouldReconnect = options.autoReconnect ?? (process.env.AUTO_RECONNECT_TUNNEL !== "false");
      if (shouldReconnect && !this.manualStop && !isAuthError) {
        this.scheduleReconnect();
      }
    });

    await new Promise<void>((resolve, reject) => {
      child.once("spawn", () => {
        if (isNamedCloudflare && initialUrl) {
          this.current = { ...this.current, state: "running", publicUrl: initialUrl };
        }
        resolve();
      });
      child.once("error", (error) => {
        if (this.child === child) {
          this.clearStartupTimer();
          this.child = undefined;
          this.output = "";
          this.current = { state: "failed", provider, error: `Không thể mở ${provider}. Kiểm tra cloudflared, ngrok hoặc OpenSSH.` };
        }
        reject(new Error(this.current.error ?? `Không thể mở ${provider}`, { cause: error }));
      });
    });

    if (!initialUrl && !isNamedCloudflare) {
      this.startupTimer = setTimeout(() => {
        if (this.child !== child || this.current.publicUrl) return;
        this.current = {
          state: "failed",
          provider,
          error: `${provider} không trả URL sau ${Math.ceil(this.startupTimeoutMs / 1000)} giây. Hãy thử nhà cung cấp khác.`,
        };
        child.kill("SIGTERM");
        const force = setTimeout(() => child.kill("SIGKILL"), 2_000);
        force.unref();
      }, this.startupTimeoutMs);
      this.startupTimer.unref();
    }

    return this.status();
  }

  async stop(): Promise<TunnelStatus> {
    this.manualStop = true;
    this.clearReconnectTimer();
    this.clearStartupTimer();
    const child = this.child;
    if (!child) {
      this.current = { state: "stopped" };
      return this.status();
    }
    this.current = { ...this.current, state: "stopping" };
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        resolve();
      };
      child.once("close", finish);
      child.kill("SIGTERM");
      const force = setTimeout(() => {
        if (this.child === child) child.kill("SIGKILL");
        finish();
      }, 2_000);
      force.unref();
    });
    if (this.child === child) this.child = undefined;
    this.output = "";
    this.current = { state: "stopped" };
    try {
      const { exec } = await import("node:child_process");
      if (process.platform === "win32") {
        exec("taskkill /F /IM ngrok.exe");
      } else {
        exec("pkill -9 -f ngrok");
      }
    } catch {}
    return this.status();
  }

  async shutdown(): Promise<void> {
    await this.stop();
  }

  private clearStartupTimer(): void {
    if (!this.startupTimer) return;
    clearTimeout(this.startupTimer);
    this.startupTimer = undefined;
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    if (!this.lastStartOptions || this.manualStop) return;

    this.reconnectAttempts += 1;
    const delayMs = Math.min(30_000, 2_000 * Math.pow(1.5, Math.min(this.reconnectAttempts, 6)));
    this.reconnectTimer = setTimeout(() => {
      if (this.manualStop || !this.lastStartOptions) return;
      void this.start(this.lastStartOptions).catch(() => undefined);
    }, delayMs);
    this.reconnectTimer.unref();
  }
}
