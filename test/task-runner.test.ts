import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PathPolicy } from "../src/security/path-policy.js";
import { TaskRunner } from "../src/services/task-runner.js";

test("task runner executes only exact registered commands with a sanitized environment", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-coder-task-"));
  context.after(async () => await fs.rm(root, { recursive: true, force: true }));
  const state = path.join(root, ".local-coder");
  await fs.mkdir(state);
  const tasksFile = path.join(state, "tasks.json");
  await fs.writeFile(tasksFile, JSON.stringify({
    version: 1,
    tasks: {
      inspect: {
        description: "Inspect safe environment",
        program: process.execPath,
        args: ["-e", "process.stdout.write(JSON.stringify({home:process.env.HOME,secret:process.env.TEST_SECRET||null}))"],
      },
      slow: {
        description: "Long-running fixture",
        program: process.execPath,
        args: ["-e", "setInterval(()=>{},1000)"],
      },
    },
  }));
  const policy = await PathPolicy.create([root], state, false);
  const runner = new TaskRunner(tasksFile, state, policy, 5_000, 10_000);
  process.env.TEST_SECRET = "must-not-leak";
  context.after(() => delete process.env.TEST_SECRET);
  const result = await runner.run("inspect");
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), { home: path.join(state, "runtime-home"), secret: null });
  await assert.rejects(runner.run("anything-else"), /operator-approved/);

  const limited = new TaskRunner(tasksFile, state, policy, 5_000, 10_000, 1, 1);
  const background = await limited.start("slow");
  await assert.rejects(limited.start("slow"), /limit reached/);
  const stopped = await limited.stop(background.id);
  assert.equal(stopped.status, "stopped");
  await limited.shutdown();
});
