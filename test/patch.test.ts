import assert from "node:assert/strict";
import test from "node:test";
import { applyPatch, patchStats } from "../src/lib/patch.js";

test("applies a strict unified patch", () => {
  const original = "alpha\nbeta\ngamma\n";
  const patch = "@@ -1,3 +1,3 @@\n alpha\n-beta\n+BETA\n gamma";
  assert.equal(applyPatch(original, patch), "alpha\nBETA\ngamma\n");
  assert.deepEqual(patchStats(patch), { added: 1, removed: 1 });
});

test("supports Codex wrapper and preserves CRLF", () => {
  const original = "a\r\nb\r\n";
  const patch = "*** Begin Patch\n*** Update File: sample.txt\n@@\n a\n-b\n+c\n*** End Patch";
  assert.equal(applyPatch(original, patch), "a\r\nc\r\n");
});

test("rejects ambiguous patch context", () => {
  assert.throws(() => applyPatch("x\ny\nx\ny\n", "@@\n x\n-y\n+z"), /ambiguous/);
});
