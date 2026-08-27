import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AuditLog } from "../src/infra/audit.js";

test("audit history rotates and reloads without storing unbounded JSONL", async (context) => {
  const state = await fs.mkdtemp(path.join(os.tmpdir(), "local-secure-audit-"));
  context.after(async () => await fs.rm(state, { recursive: true, force: true }));
  const audit = new AuditLog(state, 10, 220);
  await audit.initialize();
  await audit.record({ tool: "read_text_file", action: "read", outcome: "ok", target: "fixture-a" });
  await audit.record({ tool: "read_text_file", action: "read", outcome: "ok", target: "fixture-b" });
  assert.equal((await fs.stat(path.join(state, "audit.jsonl.1"))).isFile(), true);

  const reloaded = new AuditLog(state, 10, 220);
  await reloaded.initialize();
  assert.equal(reloaded.recent(10)[0]?.target, "fixture-b");
});
