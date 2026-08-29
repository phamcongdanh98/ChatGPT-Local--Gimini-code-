import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import path from "node:path";
import type { AppConfig } from "../config.js";
import { publicConfig } from "../config.js";
import type { AuditLog } from "../infra/audit.js";
import type { CheckpointStore } from "../infra/checkpoints.js";
import { runProcess, safeEnvironment, type ProcessResult } from "../lib/process.js";
import type { PathPolicy } from "../security/path-policy.js";
import { generateWorkspaceOverview, projectContext } from "../services/context.js";
import type { FileService } from "../services/files.js";
import type { GitService } from "../services/git.js";
import type { TaskRunner } from "../services/task-runner.js";

interface Services {
  config: AppConfig;
  policy: PathPolicy;
  audit: AuditLog;
  checkpoints: CheckpointStore;
  files: FileService;
  git: GitService;
  tasks: TaskRunner;
}

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const localWrite = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const destructive = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
const taskExecution = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };

function result(data: Record<string, unknown>, summary = "OK"): CallToolResult {
  return { structuredContent: data, content: [{ type: "text", text: `${summary}\n${JSON.stringify(data, null, 2)}` }] };
}

function processResult(value: ProcessResult): Record<string, unknown> {
  return {
    exitCode: value.exitCode,
    signal: value.signal,
    stdout: value.stdout,
    stderr: value.stderr,
    truncated: value.truncated,
    timedOut: value.timedOut,
    durationMs: value.durationMs,
  };
}

async function audited(
  audit: AuditLog,
  tool: string,
  action: string,
  target: string | undefined,
  operation: () => Promise<Record<string, unknown>>
): Promise<CallToolResult> {
  const startedAt = Date.now();
  const safeTarget = target === undefined ? undefined : path.isAbsolute(target) ? "absolute-path" : target.slice(0, 200);
  try {
    const data = await operation();
    await audit.record({ tool, action, outcome: "ok", durationMs: Date.now() - startedAt, ...(safeTarget ? { target: safeTarget } : {}) });
    return result(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const outcome = /outside|disabled|denied|not in the operator-approved/i.test(message) ? "denied" : "error";
    await audit.record({ tool, action, outcome, durationMs: Date.now() - startedAt, ...(safeTarget ? { target: safeTarget } : {}) });
    return { isError: true, content: [{ type: "text", text: message }] };
  }
}

export function createMcpServer(services: Services): McpServer {
  const { config, policy, audit, checkpoints, files, git, tasks } = services;
  const workspaceName = policy.workspaceName || path.basename(policy.primaryRoot);
  const server = new McpServer(
    { name: "chatgpt-local-secure", version: "3.0.0" },
    {
      instructions: [
        `You are connected to workspace folder '${workspaceName}'.`,
        "Operate only inside configured workspace roots.",
        "Inspect workspace_overview or project_context to view the directory tree before editing code.",
        "Prefer edit_file or apply_patch over whole-file replacement.",
        "Run only operator-approved named tasks. Destructive and network operations may be unavailable.",
        "Every file mutation creates a checkpoint; report its checkpointId.",
      ].join(" "),
    }
  );

  server.registerTool("server_status", {
    title: "Local Coder Status",
    description: "Show active permission mode, capability flags, and limits without revealing tokens or machine paths.",
    inputSchema: {},
    annotations: readOnly,
  }, async () => result({ ...publicConfig(config), workspaceName }));

  server.registerTool("workspace_overview", {
    title: "Workspace Overview & Directory Tree",
    description: "Get the project folder name and complete directory tree of the workspace selected by the user.",
    inputSchema: {},
    annotations: readOnly,
  }, async () => await audited(audit, "workspace_overview", "read", undefined, async () => await generateWorkspaceOverview(policy)));

  server.registerTool("project_context", {
    title: "Project Context",
    description: "Read bounded project guidance and common manifests from workspace roots.",
    inputSchema: {},
    annotations: readOnly,
  }, async () => await audited(audit, "project_context", "read", undefined, async () => await projectContext(policy, config.readMaxBytes)));

  server.registerTool("read_text_file", {
    title: "Read Text File",
    description: "Read a bounded UTF-8 text file inside the workspace. Line offset is zero-based.",
    inputSchema: {
      path: z.string().min(1),
      offset: z.number().int().min(0).optional().default(0),
      limit: z.number().int().min(1).max(5000).optional(),
    },
    annotations: readOnly,
  }, async ({ path, offset, limit }) => await audited(audit, "read_text_file", "read", path, async () => await files.read(path, offset, limit)));

  server.registerTool("list_directory", {
    title: "List Directory",
    description: "List one workspace directory without following symlinks.",
    inputSchema: { path: z.string().optional().default("."), maxEntries: z.number().int().min(1).max(2000).optional().default(500) },
    annotations: readOnly,
  }, async ({ path, maxEntries }) => await audited(audit, "list_directory", "read", path, async () => await files.list(path, maxEntries)));

  server.registerTool("glob_files", {
    title: "Glob Files",
    description: "Find workspace files by a glob such as **/*.ts; skips dependencies, build output, Git, and server state.",
    inputSchema: { path: z.string().optional().default("."), pattern: z.string().min(1).max(256), maxResults: z.number().int().min(1).max(1000).optional().default(200) },
    annotations: readOnly,
  }, async ({ path, pattern, maxResults }) => await audited(audit, "glob_files", "search", path, async () => await files.glob(path, pattern, maxResults)));

  server.registerTool("grep_files", {
    title: "Search File Contents",
    description: "Search bounded text files using safe literal matching.",
    inputSchema: {
      path: z.string().optional().default("."),
      pattern: z.string().min(1).max(256),
      glob: z.string().optional().default("**/*"),
      caseInsensitive: z.boolean().optional().default(false),
      maxResults: z.number().int().min(1).max(1000).optional().default(200),
    },
    annotations: readOnly,
  }, async (input) => await audited(audit, "grep_files", "search", input.path, async () => await files.grep(input)));

  server.registerTool("workspace_symbols", {
    title: "Search Workspace Symbols",
    description: "Search for function, class, interface, and type definitions across code files matching a query.",
    inputSchema: {
      path: z.string().optional().default("."),
      query: z.string().min(1).max(128),
      maxResults: z.number().int().min(1).max(100).optional().default(50),
    },
    annotations: readOnly,
  }, async ({ path: targetPath, query, maxResults }) => await audited(audit, "workspace_symbols", "search", targetPath, async () => {
    const globResult = await files.glob(targetPath, "**/*.{ts,js,tsx,jsx,py,rs,go,swift,java,cpp,c,h}", 200);
    const matches = Array.isArray(globResult["matches"]) ? (globResult["matches"] as string[]) : [];
    const symbols: Array<{ file: string; line: number; name: string; kind: string; snippet: string }> = [];
    const symbolRegex = /(?:class|function|interface|type|enum|def|fn|func|struct|protocol)\s+([A-Za-z0-9_]+)/;
    const lowerQuery = query.toLowerCase();

    for (const file of matches) {
      if (symbols.length >= maxResults) break;
      try {
        const readResult = await files.read(file, 0, 1000);
        const content = typeof readResult["content"] === "string" ? readResult["content"] : "";
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          const match = symbolRegex.exec(line);
          if (match && match[1] && match[1].toLowerCase().includes(lowerQuery)) {
            const kind = line.trim().split(/\s+/)[0] || "symbol";
            symbols.push({
              file,
              line: i + 1,
              name: match[1],
              kind,
              snippet: line.trim().slice(0, 120),
            });
            if (symbols.length >= maxResults) break;
          }
        }
      } catch {}
    }
    return { query, count: symbols.length, symbols };
  }));

  server.registerTool("git_diff_summary", {
    title: "Git Diff Summary",
    description: "Get a clean summary of modified, added, and deleted files in the local Git repository.",
    inputSchema: { path: z.string().optional().default(".") },
    annotations: readOnly,
  }, async ({ path }) => await audited(audit, "git_diff_summary", "git-read", path, async () => processResult(await git.diff(path, false))));

  if (config.permissionMode === "workspace-write") {
    server.registerTool("write_file", {
      title: "Write File",
      description: "Atomically create or replace a bounded UTF-8 file; creates a restorable checkpoint first.",
      inputSchema: { path: z.string().min(1), content: z.string(), createParents: z.boolean().optional().default(false) },
      annotations: localWrite,
    }, async ({ path, content, createParents }) => await audited(audit, "write_file", "write", path, async () => await files.write(path, content, createParents)));

    server.registerTool("edit_file", {
      title: "Edit File",
      description: "Replace an exact text fragment atomically; rejects ambiguous matches unless replaceAll is explicit.",
      inputSchema: { path: z.string().min(1), oldText: z.string().min(1), newText: z.string(), replaceAll: z.boolean().optional().default(false) },
      annotations: localWrite,
    }, async ({ path, oldText, newText, replaceAll }) => await audited(audit, "edit_file", "edit", path, async () => await files.edit(path, oldText, newText, replaceAll)));

    server.registerTool("apply_patch", {
      title: "Apply Patch",
      description: "Apply a strict single-file unified or Codex-style patch; rejects missing or ambiguous context.",
      inputSchema: { path: z.string().min(1), patch: z.string().min(1) },
      annotations: localWrite,
    }, async ({ path, patch }) => await audited(audit, "apply_patch", "patch", path, async () => await files.patch(path, patch)));

    server.registerTool("create_directory", {
      title: "Create Directory",
      description: "Create a directory and missing parents inside the workspace.",
      inputSchema: { path: z.string().min(1) },
      annotations: localWrite,
    }, async ({ path }) => await audited(audit, "create_directory", "mkdir", path, async () => await files.mkdir(path)));
  }

  server.registerTool("list_tasks", {
    title: "List Approved Tasks",
    description: "List exact commands approved by the server operator; arbitrary arguments are not accepted.",
    inputSchema: {},
    annotations: readOnly,
  }, async () => await audited(audit, "list_tasks", "read", undefined, async () => ({ tasks: await tasks.list() })));

  if (config.permissionMode === "workspace-write") {
    server.registerTool("run_task", {
      title: "Run Approved Task",
      description: "Run one operator-approved task in the foreground without a shell and with a sanitized environment. The approved program may modify files or use the network.",
      inputSchema: { name: z.string().min(1).max(64) },
      annotations: taskExecution,
    }, async ({ name }) => await audited(audit, "run_task", "execute", name, async () => processResult(await tasks.run(name))));

    server.registerTool("start_task", {
      title: "Start Approved Background Task",
      description: "Start one operator-approved task in the background without a shell. The approved program may modify files or use the network.",
      inputSchema: { name: z.string().min(1).max(64) },
      annotations: taskExecution,
    }, async ({ name }) => await audited(audit, "start_task", "execute", name, async () => ({ task: await tasks.start(name) })));

    server.registerTool("task_status", {
      title: "Background Task Status",
      description: "Read status and bounded output for a background task.",
      inputSchema: { id: z.string().uuid() },
      annotations: readOnly,
    }, async ({ id }) => await audited(audit, "task_status", "read", id, async () => ({ task: tasks.get(id) })));

    server.registerTool("stop_task", {
      title: "Stop Background Task",
      description: "Send SIGTERM to a running background task.",
      inputSchema: { id: z.string().uuid() },
      annotations: destructive,
    }, async ({ id }) => await audited(audit, "stop_task", "stop", id, async () => ({ task: await tasks.stop(id) })));
  }

  server.registerTool("git_status", {
    title: "Git Status",
    description: "Show concise local Git working-tree status.",
    inputSchema: { path: z.string().optional().default(".") },
    annotations: readOnly,
  }, async ({ path }) => await audited(audit, "git_status", "git-read", path, async () => processResult(await git.status(path))));

  server.registerTool("git_diff", {
    title: "Git Diff",
    description: "Show bounded staged or unstaged local Git diff.",
    inputSchema: { path: z.string().optional().default("."), staged: z.boolean().optional().default(false) },
    annotations: readOnly,
  }, async ({ path, staged }) => await audited(audit, "git_diff", "git-read", path, async () => processResult(await git.diff(path, staged))));

  server.registerTool("git_log", {
    title: "Git Log",
    description: "Show recent local commit history.",
    inputSchema: { path: z.string().optional().default("."), maxCount: z.number().int().min(1).max(100).optional().default(20) },
    annotations: readOnly,
  }, async ({ path, maxCount }) => await audited(audit, "git_log", "git-read", path, async () => processResult(await git.log(path, maxCount))));

  if (config.permissionMode === "workspace-write") {
    server.registerTool("git_add", {
      title: "Git Add Paths",
      description: "Stage only explicit workspace paths in the local repository.",
      inputSchema: { path: z.string().optional().default("."), files: z.array(z.string().min(1)).min(1).max(100) },
      annotations: localWrite,
    }, async ({ path, files }) => await audited(audit, "git_add", "git-write", path, async () => processResult(await git.add(path, files))));

    server.registerTool("git_commit", {
      title: "Git Commit",
      description: "Commit already-staged local changes. This tool never stages implicitly and never pushes.",
      inputSchema: { path: z.string().optional().default("."), message: z.string().min(1).max(500) },
      annotations: localWrite,
    }, async ({ path, message }) => await audited(audit, "git_commit", "git-write", path, async () => processResult(await git.commit(path, message))));
  }

  server.registerTool("list_checkpoints", {
    title: "List File Checkpoints",
    description: "List recent server-created snapshots without exposing machine paths.",
    inputSchema: {},
    annotations: readOnly,
  }, async () => result({ checkpoints: await checkpoints.list() }));

  if (config.permissionMode === "workspace-write" && config.allowDestructive) {
    server.registerTool("delete_file", {
      title: "Delete File",
      description: "Delete one regular workspace file after creating a restorable checkpoint.",
      inputSchema: { path: z.string().min(1) },
      annotations: destructive,
    }, async ({ path }) => await audited(audit, "delete_file", "delete", path, async () => await files.remove(path)));

    server.registerTool("restore_checkpoint", {
      title: "Restore File Checkpoint",
      description: "Overwrite affected files with one prior checkpoint. This is destructive to current contents.",
      inputSchema: { id: z.string().min(1).max(100) },
      annotations: destructive,
    }, async ({ id }) => await audited(audit, "restore_checkpoint", "restore", id, async () => ({ checkpoint: await checkpoints.restore(id) })));

    server.registerTool("git_restore", {
      title: "Git Restore Paths",
      description: "Discard local worktree changes for explicit paths; optionally unstage instead.",
      inputSchema: { path: z.string().optional().default("."), files: z.array(z.string().min(1)).min(1).max(100), staged: z.boolean().optional().default(false) },
      annotations: destructive,
    }, async ({ path, files, staged }) => await audited(audit, "git_restore", "git-destructive", path, async () => processResult(await git.restore(path, files, staged))));
  }

  if (config.permissionMode === "workspace-write" && config.allowRemoteGit) {
    const remoteAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };
    for (const operation of ["pull", "push"] as const) {
      server.registerTool(`git_${operation}`, {
        title: `Git ${operation}`,
        description: `${operation === "pull" ? "Fetch and merge from" : "Send commits to"} the repository's configured remote. Network access and credentials may be used.`,
        inputSchema: { path: z.string().optional().default(".") },
        annotations: remoteAnnotations,
      }, async ({ path }) => await audited(audit, `git_${operation}`, "git-remote", path, async () => processResult(await git.remote(path, operation))));
    }
  }

  if (config.permissionMode === "workspace-write" && config.allowUnsafeShell) {
    server.registerTool("unsafe_shell", {
      title: "Unsafe Shell Command",
      description: "Run an arbitrary shell command inside a workspace root. Explicit high-risk operator opt-in only.",
      inputSchema: { command: z.string().min(1).max(10_000), path: z.string().optional().default(".") },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    }, async ({ command, path }) => await audited(audit, "unsafe_shell", "shell", path, async () => {
      const cwd = await policy.resolve(path, { mustExist: true, allowSensitive: true });
      return processResult(await runProcess({
        program: command,
        args: [],
        cwd,
        env: safeEnvironment(config.stateDir),
        timeoutMs: config.taskTimeoutMs,
        outputMaxBytes: config.toolOutputMaxBytes,
        shell: true,
      }));
    }));
  }

  return server;
}
