import fs from "node:fs/promises";
import path from "node:path";

const entry = path.resolve("dist", "src", "index.js");
await fs.chmod(entry, 0o755).catch((error) => {
  if (process.platform !== "win32") throw error;
});
