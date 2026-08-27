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

export async function projectContext(policy: PathPolicy, maxBytes: number): Promise<Record<string, unknown>> {
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
  return { documents, truncated: remaining === 0 };
}
