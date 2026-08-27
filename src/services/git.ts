import fs from "node:fs/promises";
import path from "node:path";
import type { PathPolicy } from "../security/path-policy.js";
import { runProcess, safeEnvironment, type ProcessResult } from "../lib/process.js";

export class GitService {
  constructor(
    private readonly policy: PathPolicy,
    private readonly stateDir: string,
    private readonly timeoutMs: number,
    private readonly outputMaxBytes: number
  ) {}

  async status(repo = "."): Promise<ProcessResult> {
    return await this.git(repo, ["status", "--short", "--branch"]);
  }

  async diff(repo = ".", staged = false): Promise<ProcessResult> {
    return await this.git(repo, ["diff", ...(staged ? ["--cached"] : []), "--no-ext-diff"]);
  }

  async log(repo = ".", maxCount = 20): Promise<ProcessResult> {
    const count = Math.max(1, Math.min(maxCount, 100));
    return await this.git(repo, ["log", `--max-count=${count}`, "--date=iso-strict", "--pretty=format:%h%x09%ad%x09%s"]);
  }

  async add(repo: string, inputs: string[]): Promise<ProcessResult> {
    if (inputs.length === 0 || inputs.length > 100) throw new Error("git_add requires 1 to 100 paths");
    const repository = await this.repository(repo);
    const safePaths: string[] = [];
    for (const input of inputs) {
      const absolute = await this.policy.resolve(path.resolve(repository, input));
      const relative = path.relative(repository, absolute);
      if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Git path is outside repository");
      safePaths.push(relative || ".");
    }
    return await this.execute(repository, ["add", "--", ...safePaths]);
  }

  async commit(repo: string, message: string): Promise<ProcessResult> {
    const trimmed = message.trim();
    if (!trimmed || trimmed.length > 500) throw new Error("Commit message must contain 1 to 500 characters");
    return await this.git(repo, ["commit", "-m", trimmed]);
  }

  async restore(repo: string, inputs: string[], staged: boolean): Promise<ProcessResult> {
    if (inputs.length === 0 || inputs.length > 100) throw new Error("git_restore requires 1 to 100 paths");
    const repository = await this.repository(repo);
    const safePaths: string[] = [];
    for (const input of inputs) {
      const absolute = await this.policy.resolve(path.resolve(repository, input));
      const relative = path.relative(repository, absolute);
      if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Git path is outside repository");
      safePaths.push(relative || ".");
    }
    return await this.execute(repository, ["restore", ...(staged ? ["--staged"] : []), "--", ...safePaths]);
  }

  async remote(repo: string, operation: "pull" | "push"): Promise<ProcessResult> {
    return await this.git(repo, [operation]);
  }

  private async git(repo: string, args: string[]): Promise<ProcessResult> {
    return await this.execute(await this.repository(repo), args);
  }

  private async repository(repo: string): Promise<string> {
    const directory = await this.policy.resolve(repo, { mustExist: true, allowSensitive: true });
    if (!(await fs.stat(directory)).isDirectory()) throw new Error("Repository path is not a directory");
    const result = await this.execute(directory, ["rev-parse", "--show-toplevel"]);
    if (result.exitCode !== 0) throw new Error("Path is not inside a Git repository");
    const topLevel = result.stdout.trim();
    if (!topLevel || !this.policy.isInside(topLevel)) throw new Error("Git repository is outside workspace roots");
    return topLevel;
  }

  private async execute(cwd: string, args: string[]): Promise<ProcessResult> {
    const hooksDir = path.join(this.stateDir, "runtime-home", "empty-git-hooks");
    await fs.mkdir(hooksDir, { recursive: true, mode: 0o700 });
    const credentialArgs: string[] = [];
    if (process.platform === "darwin") {
      credentialArgs.push("-c", "credential.helper=osxkeychain");
    } else if (process.platform === "win32") {
      credentialArgs.push("-c", "credential.helper=manager");
    }
    credentialArgs.push(
      "-c", "credential.https://github.com.helper=!gh auth git-credential",
      "-c", "credential.https://gist.github.com.helper=!gh auth git-credential"
    );
    const authEnv: Record<string, string> = {
      GIT_TERMINAL_PROMPT: "0",
      GIT_PAGER: "cat",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    };
    if (process.env.HOME) authEnv.HOME = process.env.HOME;
    if (process.env.USER) authEnv.USER = process.env.USER;
    if (process.env.LOGNAME) authEnv.LOGNAME = process.env.LOGNAME;
    if (process.env.SSH_AUTH_SOCK) authEnv.SSH_AUTH_SOCK = process.env.SSH_AUTH_SOCK;

    return await runProcess({
      program: "git",
      args: [
        "-c", `core.hooksPath=${hooksDir}`,
        "-c", "core.fsmonitor=false",
        "-c", "commit.gpgSign=false",
        ...credentialArgs,
        ...args,
      ],
      cwd,
      env: safeEnvironment(this.stateDir, authEnv),
      timeoutMs: this.timeoutMs,
      outputMaxBytes: this.outputMaxBytes,
    });
  }
}
