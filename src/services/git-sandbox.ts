import { runProcess } from "../lib/process.js";
import { tunnelEnvironment } from "../cli/tunnel.js";
import fs from "node:fs/promises";
import path from "node:path";

export interface GitSandboxStatus {
  isGitRepo: boolean;
  currentBranch: string;
  isSandbox: boolean;
  baseBranch?: string | undefined;
  hasUncommittedChanges: boolean;
}

async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function execGit(workspaceRoot: string, args: string[]): Promise<string> {
  const result = await runProcess({
    program: "git",
    args,
    cwd: workspaceRoot,
    env: tunnelEnvironment(process.env),
    timeoutMs: 15_000,
    outputMaxBytes: 64 * 1024,
  });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || `Lệnh git ${args[0]} thất bại với mã ${result.exitCode}`);
  }
  return result.stdout.trim();
}

export async function getGitSandboxStatus(workspaceRoot: string): Promise<GitSandboxStatus> {
  const gitDir = path.join(workspaceRoot, ".git");
  if (!(await isDirectory(gitDir))) {
    return {
      isGitRepo: false,
      currentBranch: "",
      isSandbox: false,
      hasUncommittedChanges: false,
    };
  }

  try {
    const currentBranch = await execGit(workspaceRoot, ["branch", "--show-current"]);
    const statusOut = await execGit(workspaceRoot, ["status", "--porcelain"]);
    const hasUncommittedChanges = statusOut.length > 0;
    const isSandbox = currentBranch.startsWith("ai/");

    return {
      isGitRepo: true,
      currentBranch,
      isSandbox,
      baseBranch: isSandbox ? "main" : undefined,
      hasUncommittedChanges,
    };
  } catch {
    return {
      isGitRepo: true,
      currentBranch: "unknown",
      isSandbox: false,
      hasUncommittedChanges: false,
    };
  }
}

export async function createSandboxBranch(workspaceRoot: string, customName?: string): Promise<{ branch: string; baseBranch: string }> {
  const status = await getGitSandboxStatus(workspaceRoot);
  if (!status.isGitRepo) throw new Error("Thư mục hiện tại không phải là một Git repository");
  if (status.isSandbox) throw new Error(`Đang ở sẵn trong nhánh AI Sandbox (${status.currentBranch})`);

  const baseBranch = status.currentBranch || "main";
  const branchName = customName ? (customName.startsWith("ai/") ? customName : `ai/${customName}`) : `ai/session-${Date.now().toString(36)}`;

  await execGit(workspaceRoot, ["checkout", "-b", branchName]);
  return { branch: branchName, baseBranch };
}

export async function mergeSandboxBranch(workspaceRoot: string, targetBranch = "main"): Promise<{ success: boolean; targetBranch: string }> {
  const status = await getGitSandboxStatus(workspaceRoot);
  if (!status.isGitRepo) throw new Error("Không phải Git repository");
  if (!status.isSandbox) throw new Error("Chỉ có thể merge khi đang ở trong nhánh AI Sandbox");

  const sandboxBranch = status.currentBranch;

  // Auto commit pending changes in sandbox if any
  if (status.hasUncommittedChanges) {
    await execGit(workspaceRoot, ["add", "."]);
    await execGit(workspaceRoot, ["commit", "-m", `feat(ai): changes from ${sandboxBranch}`]);
  }

  // Switch to target branch and merge
  await execGit(workspaceRoot, ["checkout", targetBranch]);
  await execGit(workspaceRoot, ["merge", sandboxBranch]);
  await execGit(workspaceRoot, ["branch", "-d", sandboxBranch]);

  return { success: true, targetBranch };
}

export async function discardSandboxBranch(workspaceRoot: string, targetBranch = "main"): Promise<{ success: boolean; targetBranch: string }> {
  const status = await getGitSandboxStatus(workspaceRoot);
  if (!status.isGitRepo) throw new Error("Không phải Git repository");
  if (!status.isSandbox) throw new Error("Chỉ có thể hủy khi đang ở trong nhánh AI Sandbox");

  const sandboxBranch = status.currentBranch;

  // Discard all changes
  await execGit(workspaceRoot, ["reset", "--hard"]);
  await execGit(workspaceRoot, ["clean", "-fd"]);

  // Switch back to target branch and delete sandbox branch
  await execGit(workspaceRoot, ["checkout", targetBranch]);
  await execGit(workspaceRoot, ["branch", "-D", sandboxBranch]);

  return { success: true, targetBranch };
}
