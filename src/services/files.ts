import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { PathPolicy } from "../security/path-policy.js";
import type { CheckpointStore } from "../infra/checkpoints.js";
import { applyPatch, patchStats } from "../lib/patch.js";
import { globSearch, grepSearch } from "../lib/file-search.js";

export class FileService {
  constructor(
    private readonly policy: PathPolicy,
    private readonly checkpoints: CheckpointStore,
    private readonly readMaxBytes: number,
    private readonly writeMaxBytes: number
  ) {}

  async read(inputPath: string, offset = 0, limit?: number): Promise<Record<string, unknown>> {
    const target = await this.policy.resolve(inputPath, { mustExist: true });
    const stat = await fs.stat(target);
    if (!stat.isFile()) throw new Error("Path is not a regular file");
    if (stat.size > this.readMaxBytes) throw new Error(`File exceeds read limit of ${this.readMaxBytes} bytes`);
    const text = await fs.readFile(target, "utf8");
    const lines = text.split(/\r?\n/);
    const safeOffset = Math.max(0, offset);
    const safeLimit = Math.max(1, Math.min(limit ?? lines.length, 5_000));
    const selected = lines.slice(safeOffset, safeOffset + safeLimit);
    return {
      path: this.policy.label(target),
      content: selected.join("\n"),
      offset: safeOffset,
      returnedLines: selected.length,
      totalLines: lines.length,
      truncated: safeOffset + selected.length < lines.length,
    };
  }

  async list(inputPath = ".", maxEntries = 500): Promise<Record<string, unknown>> {
    const target = await this.policy.resolve(inputPath, { mustExist: true });
    const stat = await fs.stat(target);
    if (!stat.isDirectory()) throw new Error("Path is not a directory");
    const entries = (await fs.readdir(target, { withFileTypes: true }))
      .filter((entry) => entry.name !== ".local-coder" && entry.name !== ".git");
    const visible = entries
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, Math.max(1, Math.min(maxEntries, 2_000)))
      .map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : entry.isSymbolicLink() ? "symlink" : "other",
      }));
    return { path: this.policy.label(target), entries: visible, truncated: visible.length < entries.length };
  }

  async glob(inputPath: string, pattern: string, maxResults = 200): Promise<Record<string, unknown>> {
    const root = await this.directory(inputPath);
    const results = await globSearch(root, pattern, Math.max(1, Math.min(maxResults, 1_000)));
    return { root: this.policy.label(root), pattern, matches: results.map((file) => this.policy.label(file)) };
  }

  async grep(options: {
    path: string;
    pattern: string;
    glob?: string;
    caseInsensitive?: boolean;
    maxResults?: number;
  }): Promise<Record<string, unknown>> {
    const root = await this.directory(options.path);
    const matches = await grepSearch({
      root,
      pattern: options.pattern,
      glob: options.glob ?? "**/*",
      caseInsensitive: options.caseInsensitive ?? false,
      maxResults: Math.max(1, Math.min(options.maxResults ?? 200, 1_000)),
      maxFileBytes: this.readMaxBytes,
    });
    return {
      root: this.policy.label(root),
      matches: matches.map((match) => ({ ...match, path: this.policy.label(match.path) })),
    };
  }

  async write(inputPath: string, content: string, createParents = false): Promise<Record<string, unknown>> {
    this.assertWriteSize(content);
    const target = await this.policy.resolve(inputPath);
    const parent = path.dirname(target);
    if (createParents) await fs.mkdir(parent, { recursive: true });
    else {
      const parentStat = await fs.stat(parent);
      if (!parentStat.isDirectory()) throw new Error("Parent is not a directory");
    }
    const checkpointId = await this.checkpoints.capture("write_file", [target]);
    await this.atomicWrite(target, content);
    return { path: this.policy.label(target), bytes: Buffer.byteLength(content), checkpointId };
  }

  async edit(inputPath: string, oldText: string, newText: string, replaceAll = false): Promise<Record<string, unknown>> {
    if (!oldText) throw new Error("oldText must not be empty");
    const target = await this.policy.resolve(inputPath, { mustExist: true });
    const original = await fs.readFile(target, "utf8");
    if (Buffer.byteLength(original) > this.readMaxBytes) throw new Error("File exceeds edit read limit");
    const occurrences = original.split(oldText).length - 1;
    if (occurrences === 0) throw new Error("oldText was not found");
    if (!replaceAll && occurrences !== 1) throw new Error("oldText is ambiguous; include more context or use replaceAll");
    const updated = replaceAll ? original.split(oldText).join(newText) : original.replace(oldText, newText);
    this.assertWriteSize(updated);
    const checkpointId = await this.checkpoints.capture("edit_file", [target]);
    await this.atomicWrite(target, updated);
    return { path: this.policy.label(target), replacements: replaceAll ? occurrences : 1, checkpointId };
  }

  async patch(inputPath: string, patch: string): Promise<Record<string, unknown>> {
    const target = await this.policy.resolve(inputPath, { mustExist: true });
    const original = await fs.readFile(target, "utf8");
    if (Buffer.byteLength(original) > this.readMaxBytes) throw new Error("File exceeds patch read limit");
    const updated = applyPatch(original, patch);
    this.assertWriteSize(updated);
    const checkpointId = await this.checkpoints.capture("apply_patch", [target]);
    await this.atomicWrite(target, updated);
    return { path: this.policy.label(target), ...patchStats(patch), checkpointId };
  }

  async mkdir(inputPath: string): Promise<Record<string, unknown>> {
    const target = await this.policy.resolve(inputPath);
    await fs.mkdir(target, { recursive: true });
    return { path: this.policy.label(target), created: true };
  }

  async remove(inputPath: string): Promise<Record<string, unknown>> {
    const target = await this.policy.resolve(inputPath, { mustExist: true });
    const stat = await fs.stat(target);
    if (!stat.isFile()) throw new Error("delete_file only removes regular files");
    const checkpointId = await this.checkpoints.capture("delete_file", [target]);
    await fs.rm(target);
    return { path: this.policy.label(target), deleted: true, checkpointId };
  }

  private async directory(inputPath: string): Promise<string> {
    const target = await this.policy.resolve(inputPath, { mustExist: true });
    if (!(await fs.stat(target)).isDirectory()) throw new Error("Search root is not a directory");
    return target;
  }

  private assertWriteSize(content: string): void {
    if (Buffer.byteLength(content) > this.writeMaxBytes) {
      throw new Error(`Content exceeds write limit of ${this.writeMaxBytes} bytes`);
    }
  }

  private async atomicWrite(target: string, content: string): Promise<void> {
    const temporary = path.join(path.dirname(target), `.${path.basename(target)}.local-coder-${crypto.randomUUID()}`);
    let mode = 0o600;
    try {
      mode = (await fs.stat(target)).mode;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await fs.writeFile(temporary, content, { encoding: "utf8", mode, flag: "wx" });
      await fs.rename(temporary, target);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}
