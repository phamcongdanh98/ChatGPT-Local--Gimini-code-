import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("package scripts do not require a globally installed pnpm binary", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };

  for (const [name, command] of Object.entries(manifest.scripts ?? {})) {
    assert.doesNotMatch(
      command,
      /(^|[;&|]\s*)pnpm(?:\s|$)/,
      `script ${name} must not call a global pnpm binary`,
    );
  }
});

test("published CLI has an executable shebang and builds before packing", async () => {
  const manifest = JSON.parse(await readFile("package.json", "utf8")) as {
    bin?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  assert.equal(manifest.bin?.["chatgpt-local-secure"], "dist/src/index.js");
  assert.equal(manifest.scripts?.prepack, "npm run build");
  assert.match(await readFile("src/index.ts", "utf8"), /^#!\/usr\/bin\/env node/);
});
