import "dotenv/config";
import { loadConfig } from "../dist/src/config.js";
import { startApplication } from "../dist/src/http/app.js";
import { launchDesktopApp } from "../dist/src/cli/desktop.js";

const config = loadConfig();
const application = await startApplication(config);
process.stdout.write(`ChatGPT Local Secure listening on http://${config.host}:${application.port}/mcp\n`);
if (application.adminPort !== undefined) {
  process.stdout.write(`Dashboard: http://127.0.0.1:${application.adminPort}/ui\n`);
  setTimeout(() => void launchDesktopApp(application.adminPort), 500).unref();
}

let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await application.close();
};
process.once("SIGINT", () => void close().finally(() => process.exit(0)));
process.once("SIGTERM", () => void close().finally(() => process.exit(0)));
