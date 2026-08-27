import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config as loadEnvironment } from "dotenv";
import { loadConfig } from "../dist/src/config.js";
import { startApplication } from "../dist/src/http/app.js";
import { startSetupServer } from "../dist/src/http/setup.js";
import { launchDesktopApp } from "../dist/src/cli/desktop.js";

const projectRoot = process.cwd();
const envPath = path.join(projectRoot, ".env");
const handoffToken = crypto.randomBytes(32).toString("base64url");
const configured = await fs.stat(envPath).then((stat) => stat.isFile()).catch(() => false);

if (!configured) {
  const setup = await startSetupServer({ projectRoot, handoffToken });
  process.stdout.write(`Thiết lập lần đầu: http://127.0.0.1:${setup.port}/setup\n`);
  setTimeout(() => void launchDesktopApp(setup.port, "/setup"), 300).unref();
  await setup.completed;
  await setup.close();
}

const loaded = loadEnvironment({ path: envPath, override: true, quiet: true });
if (loaded.error) throw loaded.error;
const config = loadConfig();
const application = await startApplication(config, { adminHandoffToken: handoffToken });
process.stdout.write(`ChatGPT Local Secure listening on http://${config.host}:${application.port}/mcp\n`);
if (application.adminPort !== undefined) {
  process.stdout.write(`Dashboard: http://127.0.0.1:${application.adminPort}/ui\n`);
  if (configured) {
    const route = `/bootstrap-session/${encodeURIComponent(handoffToken)}`;
    setTimeout(() => void launchDesktopApp(application.adminPort, route), 300).unref();
  }
}

let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  if (process.platform === "darwin") {
    try {
      const { exec } = await import("node:child_process");
      exec('pkill -f "Local Coder.app/Contents/MacOS/Local Coder"');
    } catch {}
  }
  await application.close();
};
process.once("SIGINT", () => void close().finally(() => process.exit(0)));
process.once("SIGTERM", () => void close().finally(() => process.exit(0)));
