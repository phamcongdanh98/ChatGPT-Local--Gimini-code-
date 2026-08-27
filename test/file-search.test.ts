import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { globSearch, grepSearch } from "../src/lib/file-search.js";

test("double-star globs include files at the search root", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-coder-search-"));
  context.after(async () => await fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "src"));
  await fs.writeFile(path.join(root, "root.ts"), "needle\n");
  await fs.writeFile(path.join(root, "src", "nested.ts"), "needle\n");
  const globbed = await globSearch(root, "**/*.ts", 10);
  assert.deepEqual(globbed.map((file) => path.relative(root, file)), ["root.ts", path.join("src", "nested.ts")]);
  const matches = await grepSearch({ root, pattern: "needle", glob: "**/*", caseInsensitive: false, maxResults: 10, maxFileBytes: 1000 });
  assert.equal(matches.length, 2);
  const regexLookingPattern = await grepSearch({ root, pattern: "(a+)+$", glob: "**/*", caseInsensitive: false, maxResults: 10, maxFileBytes: 1000 });
  assert.deepEqual(regexLookingPattern, []);
});
