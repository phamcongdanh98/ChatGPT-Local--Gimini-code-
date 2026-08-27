import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import "dotenv/config";

export interface DesktopLaunchOptions {
  url: string;
  platform?: NodeJS.Platform;
  projectRoot?: string;
}

export function desktopDisplayUrl(adminPort: number): string {
  return `http://127.0.0.1:${adminPort}/ui`;
}

export function buildDesktopAppCommand(options: DesktopLaunchOptions): { program: string; args: string[] } {
  const platform = options.platform ?? process.platform;
  const projectRoot = options.projectRoot ?? process.cwd();
  const url = options.url;

  if (platform === "darwin") {
    const localAppPath = path.join(projectRoot, "Local Coder.app");
    if (!fs.existsSync(localAppPath)) return { program: "/usr/bin/open", args: [url] };
    return {
      program: "/usr/bin/open",
      args: ["-a", localAppPath, "--args", url],
    };
  }

  if (platform === "win32") {
    return {
      program: "rundll32.exe",
      args: ["url.dll,FileProtocolHandler", url],
    };
  }

  return {
    program: "xdg-open",
    args: [url],
  };
}

export async function launchDesktopApp(
  adminPort = Number(process.env.ADMIN_PORT || "3001"),
  route = "/ui",
): Promise<void> {
  const safeRoute = route.startsWith("/") && !route.startsWith("//") ? route : "/ui";
  const url = `http://127.0.0.1:${adminPort}${safeRoute}`;

  process.stdout.write([
    "🖥️  Đang mở dashboard Local Coder...",
    `📍 Dashboard: ${desktopDisplayUrl(adminPort)}`,
    "💡 macOS dùng app WebKit nếu đã build; Windows/Linux dùng trình duyệt mặc định.",
    "",
  ].join("\n"));

  const command = buildDesktopAppCommand({ url });
  const child = spawn(command.program, command.args, {
    stdio: "ignore",
    detached: true,
    windowsHide: false,
  });
  child.unref();
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) {
  launchDesktopApp().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Desktop launch failed"}\n`);
    process.exitCode = 1;
  });
}
