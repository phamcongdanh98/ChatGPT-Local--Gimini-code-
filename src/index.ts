#!/usr/bin/env node
import "dotenv/config";
import { loadConfig } from "./config.js";
import { startApplication } from "./http/app.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const application = await startApplication(config);
  process.stdout.write(`ChatGPT Local Secure listening on http://${config.host}:${application.port}/mcp\n`);
  if (application.adminPort !== undefined) {
    process.stdout.write(`Local admin dashboard: http://127.0.0.1:${application.adminPort}/ui\n`);
  }
  let closing = false;
  const close = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    await application.close();
  };
  process.once("SIGINT", () => void close().finally(() => process.exit(0)));
  process.once("SIGTERM", () => void close().finally(() => process.exit(0)));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  process.stderr.write(`Startup failed: ${message}\n`);
  process.exitCode = 1;
});
