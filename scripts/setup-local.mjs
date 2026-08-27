import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const projectRoot = process.cwd();
const setupArguments = process.argv.slice(2).filter((argument) => argument !== "--");
if (setupArguments.length > 1) throw new Error("Chỉ chấp nhận một workspace path");
const workspaceInput = setupArguments[0] || projectRoot;
if (workspaceInput.includes("\0") || workspaceInput.includes("\n") || workspaceInput.includes("\r")) {
  throw new Error("Workspace path is invalid");
}
if (!path.isAbsolute(workspaceInput)) throw new Error("Workspace path must be absolute");
const workspace = await fs.realpath(path.resolve(workspaceInput));
const workspaceStat = await fs.stat(workspace).catch(() => undefined);
if (!workspaceStat?.isDirectory()) throw new Error("Workspace path must be an existing directory");
const home = await fs.realpath(os.homedir()).catch(() => path.resolve(os.homedir()));
if (workspace === path.parse(workspace).root || workspace === home) {
  throw new Error("Workspace cannot be an entire drive or the Home directory");
}

const envPath = path.join(projectRoot, ".env");
const stateDir = path.join(workspace, ".local-coder");
const tasksPath = path.join(stateDir, "tasks.json");
const envExists = await fs.stat(envPath).then(() => true).catch(() => false);
if (envExists) {
  process.stdout.write("Đã có .env — không ghi đè. Xóa hoặc đổi tên file nếu muốn tạo cấu hình mới.\n");
  process.exit(0);
}

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
  "PERMISSION_MODE=workspace-write",
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

process.stdout.write([
  "Thiết lập local hoàn tất.",
  "MCP: http://127.0.0.1:3000/mcp",
  "Dashboard: http://127.0.0.1:3001/ui",
  "Dashboard password đã lưu trong .env tại ADMIN_TOKEN.",
  "Chạy server: ./start.sh (macOS/Linux) hoặc .\\start.ps1 (Windows)",
  "Ưu tiên kết nối bằng OpenAI Secure MCP Tunnel; xem docs/secure-tunnel.md.",
  "",
].join("\n"));
