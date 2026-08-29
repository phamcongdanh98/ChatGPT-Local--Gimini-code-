import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { generateQRCodeSVG } from "../src/lib/qrcode.js";
import { AuditLog } from "../src/infra/audit.js";
import { createSandboxBranch, getGitSandboxStatus, mergeSandboxBranch } from "../src/services/git-sandbox.js";
import { runProcess } from "../src/lib/process.js";

test("generateQRCodeSVG produces valid SVG output", () => {
  const svg = generateQRCodeSVG("https://local-coder.ngrok.app/mcp/token123");
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes("</svg>"));
  assert.ok(svg.includes("viewBox"));
  assert.ok(svg.includes("fill=\"#5ce0b5\""));
});

test("AuditLog.getAnalytics returns computed statistics", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-analytics-test-"));
  const audit = new AuditLog(stateDir);
  await audit.initialize();

  await audit.record({ tool: "read_file", action: "read", outcome: "ok", durationMs: 15 });
  await audit.record({ tool: "read_file", action: "read", outcome: "ok", durationMs: 25 });
  await audit.record({ tool: "edit_file", action: "edit", outcome: "ok", durationMs: 50 });
  await audit.record({ tool: "unsafe_shell", action: "shell", outcome: "denied", durationMs: 5 });

  const analytics = audit.getAnalytics();
  assert.equal(analytics.totalCalls, 4);
  assert.equal(analytics.successfulCalls, 3);
  assert.equal(analytics.failedCalls, 1);
  assert.equal(analytics.topTools.length, 3);
  assert.equal(analytics.topTools[0]?.name, "read_file");
  assert.equal(analytics.topTools[0]?.count, 2);
  assert.equal(analytics.topTools[0]?.percentage, 50);
  assert.ok(analytics.avgDurationMs > 0);

  await fs.rm(stateDir, { recursive: true, force: true });
});

test("Git Sandbox can detect, create branch, merge and discard safely", async () => {
  const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-sandbox-test-"));
  
  // Initialize temporary git repo
  await runProcess({ program: "git", args: ["init", "-b", "main"], cwd: repoDir, env: process.env, timeoutMs: 10_000, outputMaxBytes: 64 * 1024 });
  await runProcess({ program: "git", args: ["config", "user.name", "Test User"], cwd: repoDir, env: process.env, timeoutMs: 10_000, outputMaxBytes: 64 * 1024 });
  await runProcess({ program: "git", args: ["config", "user.email", "test@example.com"], cwd: repoDir, env: process.env, timeoutMs: 10_000, outputMaxBytes: 64 * 1024 });
  
  await fs.writeFile(path.join(repoDir, "README.md"), "# Hello World\n");
  await runProcess({ program: "git", args: ["add", "."], cwd: repoDir, env: process.env, timeoutMs: 10_000, outputMaxBytes: 64 * 1024 });
  await runProcess({ program: "git", args: ["commit", "-m", "initial commit"], cwd: repoDir, env: process.env, timeoutMs: 10_000, outputMaxBytes: 64 * 1024 });

  // Check initial status
  let status = await getGitSandboxStatus(repoDir);
  assert.equal(status.isGitRepo, true);
  assert.equal(status.currentBranch, "main");
  assert.equal(status.isSandbox, false);

  // Create sandbox branch
  const created = await createSandboxBranch(repoDir, "test-ai-session");
  assert.equal(created.branch, "ai/test-ai-session");
  assert.equal(created.baseBranch, "main");

  status = await getGitSandboxStatus(repoDir);
  assert.equal(status.isSandbox, true);
  assert.equal(status.currentBranch, "ai/test-ai-session");

  // Modify file in sandbox
  await fs.appendFile(path.join(repoDir, "README.md"), "AI added line\n");
  
  // Merge sandbox back to main
  const merged = await mergeSandboxBranch(repoDir, "main");
  assert.equal(merged.success, true);
  assert.equal(merged.targetBranch, "main");

  status = await getGitSandboxStatus(repoDir);
  assert.equal(status.isSandbox, false);
  assert.equal(status.currentBranch, "main");

  // Clean up
  await fs.rm(repoDir, { recursive: true, force: true });
});
