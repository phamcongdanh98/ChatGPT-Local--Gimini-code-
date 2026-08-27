import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { z } from "zod";
import type { PathPolicy } from "../security/path-policy.js";
import { runProcess, safeEnvironment, terminateProcessTree, type ProcessResult } from "../lib/process.js";

const taskDefinitionSchema = z.object({
  description: z.string().min(1).max(500),
  program: z.string().min(1).max(4096),
  args: z.array(z.string().max(8192)).max(100).optional(),
  cwd: z.string().min(1).max(4096).optional(),
  timeoutSeconds: z.number().int().min(1).max(3600).optional(),
  env: z.record(z.string(), z.string().max(16_384)).optional(),
}).strict();

const taskFileSchema = z.object({
  version: z.literal(1),
  tasks: z.record(z.string(), taskDefinitionSchema),
}).strict().superRefine((file, context) => {
  for (const name of Object.keys(file.tasks)) {
    if (!/^[a-z0-9][a-z0-9:_-]{0,63}$/i.test(name)) {
      context.addIssue({ code: "custom", message: `Invalid task name: ${name}` });
    }
  }
});

type TaskDefinition = z.infer<typeof taskDefinitionSchema>;
type TaskFile = z.infer<typeof taskFileSchema>;

export interface TaskSummary {
  name: string;
  description: string;
  background: boolean;
}

export interface BackgroundTask {
  id: string;
  name: string;
  status: "running" | "completed" | "failed" | "stopped" | "timed-out";
  startedAt: string;
  finishedAt?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  output: string;
  truncated: boolean;
}

interface RunningTask extends BackgroundTask {
  child: ChildProcessByStdio<null, Readable, Readable>;
  timer: NodeJS.Timeout;
}

function validateTaskFile(value: unknown): TaskFile {
  const parsed = taskFileSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid task registry: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export class TaskRunner {
  private readonly backgroundTasks = new Map<string, RunningTask | BackgroundTask>();

  constructor(
    private readonly tasksFile: string,
    private readonly stateDir: string,
    private readonly policy: PathPolicy,
    private readonly defaultTimeoutMs: number,
    private readonly outputMaxBytes: number,
    private readonly maxBackgroundTasks = 4,
    private readonly completedTaskRetention = 50,
  ) {}

  async list(): Promise<TaskSummary[]> {
    const file = await this.load();
    return Object.entries(file.tasks).map(([name, definition]) => ({
      name,
      description: definition.description,
      background: true,
    }));
  }

  async run(name: string): Promise<ProcessResult> {
    const definition = await this.definition(name);
    const cwd = await this.cwd(definition);
    return await runProcess({
      program: definition.program,
      args: definition.args ?? [],
      cwd,
      env: safeEnvironment(this.stateDir, definition.env),
      timeoutMs: this.timeout(definition),
      outputMaxBytes: this.outputMaxBytes,
    });
  }

  async start(name: string): Promise<BackgroundTask> {
    const running = [...this.backgroundTasks.values()].filter((task) => task.status === "running").length;
    if (running >= this.maxBackgroundTasks) {
      throw new Error(`Background task limit reached (${this.maxBackgroundTasks})`);
    }
    const definition = await this.definition(name);
    const cwd = await this.cwd(definition);
    const id = crypto.randomUUID();
    const child = spawn(definition.program, definition.args ?? [], {
      cwd,
      env: safeEnvironment(this.stateDir, definition.env),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    const startedAt = new Date().toISOString();
    const task: RunningTask = {
      id,
      name,
      status: "running",
      startedAt,
      output: "",
      truncated: false,
      child,
      timer: setTimeout(() => {
        task.status = "timed-out";
        void terminateProcessTree(child);
      }, this.timeout(definition)),
    };
    task.timer.unref();
    const append = (chunk: Buffer): void => {
      const currentBytes = Buffer.byteLength(task.output);
      if (currentBytes >= this.outputMaxBytes) {
        task.truncated = true;
        return;
      }
      const remaining = this.outputMaxBytes - currentBytes;
      task.output += chunk.subarray(0, remaining).toString("utf8");
      if (chunk.length > remaining) task.truncated = true;
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", (error) => append(Buffer.from(`\nFailed to start: ${error.message}\n`)));
    child.once("close", (exitCode, signal) => {
      clearTimeout(task.timer);
      const existing = this.backgroundTasks.get(id);
      if (!existing) return;
      const status = task.status === "timed-out" || task.status === "stopped"
        ? task.status
        : exitCode === 0 ? "completed" : "failed";
      this.backgroundTasks.set(id, {
        id,
        name,
        status,
        startedAt,
        finishedAt: new Date().toISOString(),
        exitCode,
        signal,
        output: task.output,
        truncated: task.truncated,
      });
      this.pruneCompleted();
    });
    this.backgroundTasks.set(id, task);
    return this.publicTask(task);
  }

  get(id: string): BackgroundTask {
    const task = this.backgroundTasks.get(id);
    if (!task) throw new Error("Background task not found");
    return this.publicTask(task);
  }

  async stop(id: string): Promise<BackgroundTask> {
    const task = this.backgroundTasks.get(id);
    if (!task) throw new Error("Background task not found");
    if (!("child" in task) || task.status !== "running") return this.publicTask(task);
    task.status = "stopped";
    await terminateProcessTree(task.child);
    return this.get(id);
  }

  async shutdown(): Promise<void> {
    const running = [...this.backgroundTasks.values()]
      .filter((task): task is RunningTask => "child" in task && task.status === "running");
    for (const task of running) task.status = "stopped";
    await Promise.all(running.map(async (task) => await terminateProcessTree(task.child)));
  }

  private async load(): Promise<TaskFile> {
    try {
      return validateTaskFile(JSON.parse(await fs.readFile(this.tasksFile, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, tasks: {} };
      }
      throw error;
    }
  }

  private async definition(name: string): Promise<TaskDefinition> {
    const definition = (await this.load()).tasks[name];
    if (!definition) throw new Error("Task is not in the operator-approved task registry");
    return definition;
  }

  private async cwd(definition: TaskDefinition): Promise<string> {
    const input = definition.cwd ? path.resolve(this.policy.primaryRoot, definition.cwd) : this.policy.primaryRoot;
    const resolved = await this.policy.resolve(input, { mustExist: true, allowSensitive: true });
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) throw new Error("Task cwd must be a directory");
    return resolved;
  }

  private timeout(definition: TaskDefinition): number {
    if (definition.timeoutSeconds === undefined) return this.defaultTimeoutMs;
    if (!Number.isInteger(definition.timeoutSeconds) || definition.timeoutSeconds < 1 || definition.timeoutSeconds > 3600) {
      throw new Error("Task timeoutSeconds must be between 1 and 3600");
    }
    return definition.timeoutSeconds * 1000;
  }

  private publicTask(task: BackgroundTask): BackgroundTask {
    const { id, name, status, startedAt, output, truncated } = task;
    const result: BackgroundTask = { id, name, status, startedAt, output, truncated };
    if (task.finishedAt !== undefined) result.finishedAt = task.finishedAt;
    if (task.exitCode !== undefined) result.exitCode = task.exitCode;
    if (task.signal !== undefined) result.signal = task.signal;
    return result;
  }

  private pruneCompleted(): void {
    const completed = [...this.backgroundTasks.entries()]
      .filter(([, task]) => task.status !== "running")
      .sort((left, right) => left[1].startedAt.localeCompare(right[1].startedAt));
    while (completed.length > this.completedTaskRetention) {
      const oldest = completed.shift();
      if (oldest) this.backgroundTasks.delete(oldest[0]);
    }
  }
}
