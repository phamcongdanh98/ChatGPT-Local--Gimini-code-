import { spawn, type SpawnOptions } from "node:child_process";
import { pathToFileURL } from "node:url";
import "dotenv/config";

export type TunnelProvider = "pinggy" | "cloudflared" | "ngrok";

export interface TunnelCommand {
  command: string;
  args: string[];
}

export interface TunnelCommandOptions {
  platform?: NodeJS.Platform | undefined;
  cloudflareToken?: string | undefined;
  ngrokToken?: string | undefined;
  ngrokDomain?: string | undefined;
  pinggyToken?: string | undefined;
}

export function parseTunnelProvider(value: string | undefined): TunnelProvider {
  const provider = (value || "cloudflared").trim().toLowerCase();
  if (provider !== "pinggy" && provider !== "cloudflared" && provider !== "ngrok") {
    throw new Error("Tunnel provider phải là cloudflared, pinggy hoặc ngrok");
  }
  return provider;
}

export function parseTunnelPort(value: string | undefined): number {
  const port = Number.parseInt(value || "3000", 10);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT phải là số nguyên từ 1 đến 65535 để chạy tunnel");
  }
  return port;
}

export function buildTunnelCommand(
  provider: TunnelProvider,
  port: number,
  optionsOrPlatform: TunnelCommandOptions | NodeJS.Platform = process.platform
): TunnelCommand {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("Tunnel port không hợp lệ");
  }
  const options: TunnelCommandOptions = typeof optionsOrPlatform === "string" ? { platform: optionsOrPlatform } : optionsOrPlatform;
  const platform = options.platform ?? process.platform;
  const cfToken = options.cloudflareToken || process.env.CLOUDFLARE_TUNNEL_TOKEN;
  const ngrokToken = options.ngrokToken || process.env.NGROK_AUTHTOKEN;
  const ngrokDomain = options.ngrokDomain || process.env.NGROK_DOMAIN;
  const pinggyToken = options.pinggyToken || process.env.PINGGY_TOKEN;

  if (provider === "cloudflared") {
    if (cfToken) {
      return {
        command: platform === "win32" ? "cloudflared.exe" : "cloudflared",
        args: ["tunnel", "run", "--token", cfToken],
      };
    }
    return {
      command: platform === "win32" ? "cloudflared.exe" : "cloudflared",
      args: ["tunnel", "--url", `http://127.0.0.1:${port}`, "--no-autoupdate"],
    };
  }

  if (provider === "ngrok") {
    const args = ["http", String(port)];
    if (ngrokDomain) {
      const cleanDomain = ngrokDomain.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
      if (cleanDomain) {
        args.push("--url", `https://${cleanDomain}`);
      }
    }
    if (ngrokToken) {
      args.push("--authtoken", ngrokToken.trim());
    }
    args.push("--log", "stdout", "--log-format", "logfmt");
    return {
      command: platform === "win32" ? "ngrok.exe" : "ngrok",
      args,
    };
  }

  const destination = pinggyToken ? `${pinggyToken}@a.pinggy.io` : "a.pinggy.io";
  return {
    command: platform === "win32" ? "ssh.exe" : "ssh",
    args: [
      "-o", "ExitOnForwardFailure=yes",
      "-o", "BatchMode=yes",
      "-o", "NumberOfPasswordPrompts=0",
      "-o", "ServerAliveInterval=30",
      "-o", "StrictHostKeyChecking=accept-new",
      "-p", "443",
      `-R0:localhost:${port}`,
      destination,
    ],
  };
}

export function tunnelEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowed = [
    "PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "HOME", "USERPROFILE",
    "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "TERM",
    "CLOUDFLARE_TUNNEL_TOKEN", "NGROK_AUTHTOKEN", "NGROK_DOMAIN", "PINGGY_TOKEN"
  ];
  return Object.fromEntries(allowed.flatMap((name) => env[name] === undefined ? [] : [[name, env[name]]]));
}

export async function runTunnel(providerInput = process.argv[2]): Promise<void> {
  const requested = providerInput === "--" ? process.argv[3] : providerInput;
  const provider = parseTunnelProvider(requested ?? "cloudflared");
  const port = parseTunnelPort(process.env.PORT);
  const command = buildTunnelCommand(provider, port);
  process.stdout.write([
    `Đang mở ${provider} tunnel tới MCP tại 127.0.0.1:${port}.`,
    "Chỉ cổng MCP được chuyển tiếp; Admin UI không được expose.",
    "Khi tunnel in ra HTTPS URL, dùng: https://<tunnel>/mcp/<MCP_TOKEN>",
    "MCP_TOKEN nằm trong .env và sẽ không được in ra terminal.",
    "Nhấn Ctrl+C để đóng tunnel.",
    "",
  ].join("\n"));

  const options: SpawnOptions = {
    stdio: "inherit",
    shell: false,
    env: tunnelEnvironment(process.env),
    windowsHide: false,
  };
  const child = spawn(command.command, command.args, options);
  await new Promise<void>((resolve, reject) => {
    child.once("error", (error) => {
      const hint = provider === "cloudflared"
        ? "Hãy cài cloudflared hoặc chạy `pnpm tunnel -- pinggy`."
        : "Hãy bật OpenSSH client hoặc chạy `pnpm tunnel -- cloudflared`.";
      reject(new Error(`Không thể chạy ${command.command}. ${hint}`, { cause: error }));
    });
    child.once("exit", (code, signal) => {
      if (signal || code === 0 || code === 130) resolve();
      else reject(new Error(`${provider} tunnel đã dừng với exit code ${code ?? "unknown"}`));
    });
  });
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) {
  runTunnel().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Tunnel failed"}\n`);
    process.exitCode = 1;
  });
}
