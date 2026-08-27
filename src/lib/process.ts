import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

export interface ProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timedOut: boolean;
  durationMs: number;
}

function appendBounded(current: Buffer[], chunk: Buffer, state: { bytes: number; truncated: boolean }, limit: number): void {
  if (state.bytes >= limit) {
    state.truncated = true;
    return;
  }
  const remaining = limit - state.bytes;
  current.push(chunk.subarray(0, remaining));
  state.bytes += Math.min(chunk.length, remaining);
  if (chunk.length > remaining) state.truncated = true;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function signalProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    child.kill(signal);
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") child.kill(signal);
  }
}

export async function terminateProcessTree(child: ChildProcess, graceMs = 2_000): Promise<void> {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise<boolean>((resolve) => child.once("close", () => resolve(true)));
  signalProcessTree(child, "SIGTERM");
  if (await Promise.race([closed, delay(graceMs).then(() => false)])) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        shell: false,
        stdio: "ignore",
        windowsHide: true,
      });
      killer.once("error", () => resolve());
      killer.once("close", () => resolve());
    });
  } else {
    signalProcessTree(child, "SIGKILL");
  }
  await Promise.race([closed, delay(graceMs)]);
}

export async function runProcess(options: {
  program: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  outputMaxBytes: number;
  shell?: boolean;
}): Promise<ProcessResult> {
  const startedAt = Date.now();
  return await new Promise((resolve, reject) => {
    const child = spawn(options.program, options.args, {
      cwd: options.cwd,
      env: options.env,
      shell: options.shell ?? false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const state = { bytes: 0, truncated: false };
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      void terminateProcessTree(child);
    }, options.timeoutMs);
    timer.unref();

    child.stdout.on("data", (chunk: Buffer) => appendBounded(stdout, chunk, state, options.outputMaxBytes));
    child.stderr.on("data", (chunk: Buffer) => appendBounded(stderr, chunk, state, options.outputMaxBytes));
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        exitCode,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        truncated: state.truncated,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

export function safeEnvironment(stateDir: string, additions: Record<string, string> = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    TMPDIR: process.env.TMPDIR,
    TMP: process.env.TMP,
    TEMP: process.env.TEMP,
    LANG: process.env.LANG || "C.UTF-8",
    LC_ALL: process.env.LC_ALL,
    CI: "true",
    NO_COLOR: "1",
    HOME: path.join(stateDir, "runtime-home"),
    ...(process.env.SSH_AUTH_SOCK ? { SSH_AUTH_SOCK: process.env.SSH_AUTH_SOCK } : {}),
  };
  for (const [key, value] of Object.entries(additions)) {
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) throw new Error(`Invalid task environment key: ${key}`);
    environment[key] = value;
  }
  return environment;
}
