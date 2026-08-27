import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { buildTunnelCommand, parseTunnelProvider, tunnelEnvironment, type TunnelProvider } from "../cli/tunnel.js";

export type TunnelState = "stopped" | "starting" | "running" | "stopping" | "failed";

export interface TunnelStatus {
  state: TunnelState;
  provider?: TunnelProvider;
  publicUrl?: string;
  startedAt?: string;
  error?: string;
}

type TunnelChild = ChildProcessByStdio<null, Readable, Readable>;
export type TunnelSpawner = (
  command: string,
  args: string[],
  options: Parameters<typeof spawn>[2],
) => TunnelChild;

const defaultSpawner: TunnelSpawner = (command, args, options) => spawn(command, args, options) as TunnelChild;

export function extractTunnelUrl(output: string, provider: TunnelProvider): string | undefined {
  const plain = output.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, " ");
  for (const match of plain.matchAll(/https:\/\/[^\s"'<>\]]+/gi)) {
    try {
      const candidate = new URL(match[0].replace(/[),.;]+$/, ""));
      const host = candidate.hostname.toLowerCase();
      const allowed = provider === "pinggy"
        ? host === "pinggy.io" || host.endsWith(".pinggy.io") || host === "pinggy.link" || host.endsWith(".pinggy.link")
        : host === "trycloudflare.com" || host.endsWith(".trycloudflare.com");
      if (allowed && candidate.protocol === "https:") return candidate.origin;
    } catch {
      // Ignore malformed URLs in provider output.
    }
  }
  return undefined;
}

export class TunnelManager {
  private child: TunnelChild | undefined;
  private current: TunnelStatus = { state: "stopped" };
  private output = "";
  private startupTimer: NodeJS.Timeout | undefined;

  constructor(
    private readonly startupTimeoutMs = 25_000,
    private readonly spawnTunnel: TunnelSpawner = defaultSpawner,
  ) {}

  status(): TunnelStatus {
    return { ...this.current };
  }

  async start(providerInput: string | undefined, port: number): Promise<TunnelStatus> {
    if (this.child) throw new Error("Tunnel đang chạy");
    const provider = parseTunnelProvider(providerInput);
    const command = buildTunnelCommand(provider, port);
    this.output = "";
    this.current = { state: "starting", provider, startedAt: new Date().toISOString() };

    const child = this.spawnTunnel(command.command, command.args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      env: tunnelEnvironment(process.env),
      windowsHide: true,
    });
    this.child = child;

    const inspect = (chunk: Buffer): void => {
      if (this.output.length < 32 * 1024) this.output += chunk.toString("utf8").slice(0, 32 * 1024 - this.output.length);
      const publicUrl = extractTunnelUrl(this.output, provider);
      if (publicUrl) {
        this.clearStartupTimer();
        this.current = { ...this.current, state: "running", publicUrl };
      }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.once("close", (code, signal) => {
      if (this.child !== child) return;
      this.clearStartupTimer();
      this.child = undefined;
      this.output = "";
      if (this.current.state === "failed") {
        this.current = { ...this.current };
      } else if (this.current.state === "stopping" || signal || code === 0 || code === 130) {
        this.current = { state: "stopped" };
      } else {
        this.current = { state: "failed", provider, error: `${provider} đã dừng (exit ${code ?? "unknown"})` };
      }
    });

    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", (error) => {
        if (this.child === child) {
          this.clearStartupTimer();
          this.child = undefined;
          this.output = "";
          this.current = { state: "failed", provider, error: `Không thể mở ${provider}. Kiểm tra OpenSSH hoặc cloudflared.` };
        }
        reject(new Error(this.current.error ?? `Không thể mở ${provider}`, { cause: error }));
      });
    });
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
    return this.status();
  }

  async stop(): Promise<TunnelStatus> {
    const child = this.child;
    this.clearStartupTimer();
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
}
