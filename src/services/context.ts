import fs from "node:fs/promises";
import path from "node:path";
import type { PathPolicy } from "../security/path-policy.js";

const CONTEXT_FILES = [
  "AGENTS.md",
  "README.md",
  "CLAUDE.md",
  "package.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
];

const IGNORED_NAMES = new Set([
  ".git",
  ".local-coder",
  "node_modules",
  ".DS_Store",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".next",
  "__pycache__",
]);

export async function generateWorkspaceOverview(policy: PathPolicy, maxDepth = 3, maxEntries = 120): Promise<Record<string, unknown>> {
  const workspaceName = policy.workspaceName || path.basename(policy.primaryRoot);
  let totalFiles = 0;
  let totalDirectories = 0;
  const lines: string[] = [`📁 ${workspaceName}/ (Thư mục chính được chọn)`];

  async function walk(dir: string, prefix: string, currentDepth: number): Promise<void> {
    if (currentDepth > maxDepth || lines.length >= maxEntries) return;
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const filtered = entries
      .filter((e) => !IGNORED_NAMES.has(e.name))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    for (let i = 0; i < filtered.length; i++) {
      if (lines.length >= maxEntries) {
        lines.push(`${prefix}... (các file khác đã được thu gọn)`);
        break;
      }
      const entry = filtered[i] as import("node:fs").Dirent;
      const isLast = i === filtered.length - 1;
      const branch = isLast ? "└── " : "├── ";
      const childPrefix = prefix + (isLast ? "    " : "│   ");

      if (entry.isDirectory()) {
        totalDirectories++;
        lines.push(`${prefix}${branch}📁 ${entry.name}/`);
        await walk(path.join(dir, entry.name), childPrefix, currentDepth + 1);
      } else {
        totalFiles++;
        lines.push(`${prefix}${branch}📄 ${entry.name}`);
      }
    }
  }

  await walk(policy.primaryRoot, "", 1);

  return {
    workspaceName,
    totalFiles,
    totalDirectories,
    tree: lines.join("\n"),
  };
}

export async function projectContext(policy: PathPolicy, maxBytes: number): Promise<Record<string, unknown>> {
  const workspaceName = policy.workspaceName || path.basename(policy.primaryRoot);
  const overview = await generateWorkspaceOverview(policy, 2, 40).catch(() => undefined);
  const documents: Array<{ path: string; content: string; truncated: boolean }> = [];
  let remaining = maxBytes;
  for (const root of policy.roots) {
    for (const name of CONTEXT_FILES) {
      if (remaining <= 0) break;
      const candidate = path.join(root, name);
      try {
        const resolved = await policy.resolve(candidate);
        const stat = await fs.stat(resolved);
        if (!stat.isFile()) continue;
        const buffer = await fs.readFile(resolved);
        const selected = buffer.subarray(0, remaining);
        documents.push({
          path: policy.label(resolved),
          content: selected.toString("utf8"),
          truncated: selected.length < buffer.length,
        });
        remaining -= selected.length;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
  return {
    workspaceName,
    ...(overview ? { workspaceTree: overview.tree } : {}),
    documents,
    truncated: remaining === 0,
  };
}
