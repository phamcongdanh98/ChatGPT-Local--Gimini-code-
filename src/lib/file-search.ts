import fs from "node:fs/promises";
import path from "node:path";

const SKIP_DIRECTORIES = new Set([".git", ".local-coder", "node_modules", "dist", "build", "coverage"]);

function globToRegex(pattern: string): RegExp {
  const normalized = pattern.replaceAll("\\", "/");
  let output = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index] as string;
    const next = normalized[index + 1];
    if (character === "*" && next === "*") {
      if (normalized[index + 2] === "/") {
        output += "(?:.*/)?";
        index += 2;
      } else {
        output += ".*";
        index += 1;
      }
    } else if (character === "*") output += "[^/]*";
    else if (character === "?") output += "[^/]";
    else output += character.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`${output}$`, "i");
}

async function walkFiles(root: string, maxFiles: number): Promise<string[]> {
  const files: string[] = [];
  const queue = [root];
  while (queue.length > 0 && files.length < maxFiles) {
    const directory = queue.shift() as string;
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) queue.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
        if (files.length >= maxFiles) break;
      }
    }
  }
  return files;
}

export async function globSearch(
  root: string,
  pattern: string,
  maxResults: number,
  maxFiles = 10_000
): Promise<string[]> {
  if (pattern.length > 256) throw new Error("Glob pattern is too long");
  const matcher = globToRegex(pattern);
  const files = await walkFiles(root, maxFiles);
  return files
    .filter((file) => matcher.test(path.relative(root, file).replaceAll(path.sep, "/")))
    .slice(0, maxResults);
}

export interface GrepMatch {
  path: string;
  line: number;
  text: string;
}

export async function grepSearch(options: {
  root: string;
  pattern: string;
  glob: string;
  caseInsensitive: boolean;
  maxResults: number;
  maxFileBytes: number;
  maxFiles?: number;
}): Promise<GrepMatch[]> {
  if (options.pattern.length > 256) throw new Error("Search pattern is too long");
  const matcher = globToRegex(options.glob);
  const needle = options.caseInsensitive ? options.pattern.toLocaleLowerCase() : options.pattern;
  const matches: GrepMatch[] = [];
  const files = await walkFiles(options.root, options.maxFiles ?? 10_000);

  for (const file of files) {
    if (matches.length >= options.maxResults) break;
    const relative = path.relative(options.root, file).replaceAll(path.sep, "/");
    if (!matcher.test(relative)) continue;
    const stat = await fs.stat(file);
    if (stat.size > options.maxFileBytes) continue;
    const buffer = await fs.readFile(file);
    if (buffer.includes(0)) continue;
    const lines = buffer.toString("utf8").split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] as string;
      const haystack = options.caseInsensitive ? line.toLocaleLowerCase() : line;
      if (haystack.includes(needle)) {
        matches.push({ path: file, line: index + 1, text: line.slice(0, 500) });
        if (matches.length >= options.maxResults) break;
      }
    }
  }
  return matches;
}
