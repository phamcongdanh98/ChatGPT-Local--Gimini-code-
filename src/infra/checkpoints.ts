import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { PathPolicy } from "../security/path-policy.js";

interface CheckpointFile {
  path: string;
  label: string;
  existed: boolean;
  snapshot?: string;
  mode?: number;
}

interface CheckpointMetadata {
  id: string;
  createdAt: string;
  action: string;
  files: CheckpointFile[];
}

export interface CheckpointSummary {
  id: string;
  createdAt: string;
  action: string;
  files: string[];
}

export interface CheckpointDiffResult {
  id: string;
  action: string;
  createdAt: string;
  files: Array<{
    path: string;
    label: string;
    existedBefore: boolean;
    existsNow: boolean;
    beforeContent: string;
    currentContent: string;
  }>;
}

async function pathExists(value: string): Promise<boolean> {
  try {
    await fs.lstat(value);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export class CheckpointStore {
  private readonly checkpointDir: string;

  constructor(
    stateDir: string,
    private readonly policy: PathPolicy,
    private readonly retention: number,
    private readonly maxSnapshotBytes = 16 * 1024 * 1024
  ) {
    this.checkpointDir = path.join(stateDir, "checkpoints");
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.checkpointDir, { recursive: true, mode: 0o700 });
  }

  async capture(action: string, targets: string[]): Promise<string> {
    const id = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    const directory = path.join(this.checkpointDir, id);
    await fs.mkdir(path.join(directory, "data"), { recursive: true, mode: 0o700 });

    const files: CheckpointFile[] = [];
    let totalBytes = 0;
    for (let index = 0; index < targets.length; index += 1) {
      const target = await this.policy.resolve(targets[index] as string, { allowSensitive: true });
      const existed = await pathExists(target);
      if (!existed) {
        files.push({ path: target, label: this.policy.label(target), existed: false });
        continue;
      }
      const stat = await fs.stat(target);
      if (!stat.isFile()) throw new Error("Checkpoints support files only");
      totalBytes += stat.size;
      if (totalBytes > this.maxSnapshotBytes) throw new Error("Checkpoint exceeds snapshot size limit");
      const snapshot = `data/${index}.bin`;
      await fs.copyFile(target, path.join(directory, snapshot));
      files.push({
        path: target,
        label: this.policy.label(target),
        existed: true,
        snapshot,
        mode: stat.mode,
      });
    }

    const metadata: CheckpointMetadata = {
      id,
      createdAt: new Date().toISOString(),
      action,
      files,
    };
    await fs.writeFile(path.join(directory, "metadata.json"), JSON.stringify(metadata, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    await this.prune();
    return id;
  }

  async list(): Promise<CheckpointSummary[]> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.checkpointDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const checkpoints: CheckpointSummary[] = [];
    for (const entry of entries) {
      if (!/^[a-z0-9-]+$/i.test(entry)) continue;
      try {
        const metadata = await this.readMetadata(entry);
        checkpoints.push({
          id: metadata.id,
          createdAt: metadata.createdAt,
          action: metadata.action,
          files: metadata.files.map((file) => file.label),
        });
      } catch {
        // Ignore incomplete checkpoints; they are never offered for restore.
      }
    }
    return checkpoints.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async restore(id: string): Promise<CheckpointSummary> {
    if (!/^[a-z0-9-]+$/i.test(id)) throw new Error("Invalid checkpoint id");
    const metadata = await this.readMetadata(id);
    const directory = path.join(this.checkpointDir, id);

    for (const file of metadata.files) {
      const target = await this.policy.resolve(file.path, { allowSensitive: true });
      if (file.existed) {
        if (!file.snapshot) throw new Error("Checkpoint snapshot is missing");
        const source = path.resolve(directory, file.snapshot);
        if (!source.startsWith(`${directory}${path.sep}`)) throw new Error("Invalid checkpoint snapshot path");
        await fs.mkdir(path.dirname(target), { recursive: true });
        const temporary = `${target}.local-coder-restore-${crypto.randomUUID()}`;
        try {
          await fs.copyFile(source, temporary);
          if (file.mode !== undefined) await fs.chmod(temporary, file.mode);
          await fs.rename(temporary, target);
        } finally {
          await fs.rm(temporary, { force: true }).catch(() => undefined);
        }
      } else {
        await fs.rm(target, { force: true });
      }
    }

    return {
      id: metadata.id,
      createdAt: metadata.createdAt,
      action: metadata.action,
      files: metadata.files.map((file) => file.label),
    };
  }

  async getDiff(id: string): Promise<CheckpointDiffResult> {
    if (!/^[a-z0-9-]+$/i.test(id)) throw new Error("Invalid checkpoint id");
    const metadata = await this.readMetadata(id);
    const directory = path.join(this.checkpointDir, id);
    const filesDiff: CheckpointDiffResult["files"] = [];

    for (const file of metadata.files) {
      let beforeContent = "";
      if (file.existed && file.snapshot) {
        const source = path.resolve(directory, file.snapshot);
        try {
          beforeContent = await fs.readFile(source, "utf8");
        } catch {}
      }

      let currentContent = "";
      let existsNow = false;
      try {
        currentContent = await fs.readFile(file.path, "utf8");
        existsNow = true;
      } catch {}

      filesDiff.push({
        path: file.path,
        label: file.label,
        existedBefore: file.existed,
        existsNow,
        beforeContent,
        currentContent,
      });
    }

    return {
      id: metadata.id,
      action: metadata.action,
      createdAt: metadata.createdAt,
      files: filesDiff,
    };
  }

  private async readMetadata(id: string): Promise<CheckpointMetadata> {
    const filePath = path.join(this.checkpointDir, id, "metadata.json");
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as CheckpointMetadata;
    if (parsed.id !== id || !Array.isArray(parsed.files)) throw new Error("Invalid checkpoint metadata");
    return parsed;
  }

  private async prune(): Promise<void> {
    const checkpoints = await this.list();
    for (const checkpoint of checkpoints.slice(this.retention)) {
      await fs.rm(path.join(this.checkpointDir, checkpoint.id), { recursive: true, force: true });
    }
  }
}
