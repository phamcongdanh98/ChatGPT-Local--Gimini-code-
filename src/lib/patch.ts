type PatchLine = { type: "context" | "remove" | "add"; text: string };

interface Hunk {
  oldStart?: number;
  lines: PatchLine[];
}

function normalizeEol(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function patchBody(value: string): string {
  const normalized = normalizeEol(value.trim());
  const updateHeaders = normalized.match(/^\*\*\* Update File:\s*(.+)$/gm) || [];
  if (updateHeaders.length > 1 || /^\*\*\* (Add|Delete|Move) File:/m.test(normalized)) {
    throw new Error("apply_patch accepts one explicit target file per call");
  }
  return normalized
    .split("\n")
    .filter((line) =>
      line !== "*** Begin Patch" &&
      line !== "*** End Patch" &&
      !line.startsWith("*** Update File:") &&
      !line.startsWith("--- ") &&
      !line.startsWith("+++ ") &&
      !line.startsWith("diff ")
    )
    .join("\n");
}

function parsePatch(value: string): Hunk[] {
  const lines = patchBody(value).split("\n");
  const hunks: Hunk[] = [];
  let current: Hunk | undefined;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      const match = line.match(/^@@\s*-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
      current = { lines: [], ...(match?.[1] ? { oldStart: Number(match[1]) } : {}) };
      hunks.push(current);
      continue;
    }
    if (!current || line === "\\ No newline at end of file") continue;
    if (line.startsWith(" ")) current.lines.push({ type: "context", text: line.slice(1) });
    else if (line.startsWith("-")) current.lines.push({ type: "remove", text: line.slice(1) });
    else if (line.startsWith("+")) current.lines.push({ type: "add", text: line.slice(1) });
    else if (line === "") current.lines.push({ type: "context", text: "" });
    else throw new Error(`Invalid patch line: ${line.slice(0, 80)}`);
  }

  if (hunks.length === 0 || hunks.some((hunk) => hunk.lines.length === 0)) {
    throw new Error("No valid patch hunks found; include an @@ header and +/-/context lines");
  }
  return hunks;
}

function oldLines(hunk: Hunk): string[] {
  return hunk.lines.filter((line) => line.type !== "add").map((line) => line.text);
}

function newLines(hunk: Hunk): string[] {
  return hunk.lines.filter((line) => line.type !== "remove").map((line) => line.text);
}

function matchesAt(source: string[], pattern: string[], index: number): boolean {
  if (index < 0 || index + pattern.length > source.length) return false;
  return pattern.every((line, offset) => source[index + offset] === line);
}

function findUnique(source: string[], pattern: string[], startAt: number): number {
  if (pattern.length === 0) return startAt;
  const matches: number[] = [];
  for (let index = 0; index <= source.length - pattern.length; index += 1) {
    if (matchesAt(source, pattern, index)) matches.push(index);
  }
  if (matches.length === 0) throw new Error("Patch context was not found in the target file");
  if (matches.length > 1) throw new Error("Patch context is ambiguous; include more unchanged lines");
  return matches[0] as number;
}

export function applyPatch(original: string, patch: string): string {
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const hadTrailingNewline = /(?:\r\n|\n)$/.test(original);
  const source = normalizeEol(original).split("\n");
  if (hadTrailingNewline) source.pop();
  let delta = 0;
  let searchFrom = 0;

  for (const hunk of parsePatch(patch)) {
    const before = oldLines(hunk);
    const after = newLines(hunk);
    let index: number;
    if (before.length === 0 && hunk.oldStart !== undefined) {
      index = Math.max(0, Math.min(source.length, hunk.oldStart - 1 + delta));
    } else {
      const suggested = hunk.oldStart === undefined ? searchFrom : hunk.oldStart - 1 + delta;
      index = hunk.oldStart !== undefined && matchesAt(source, before, suggested)
        ? suggested
        : findUnique(source, before, searchFrom);
    }
    source.splice(index, before.length, ...after);
    delta += after.length - before.length;
    searchFrom = index + after.length;
  }

  const result = source.join("\n") + (hadTrailingNewline ? "\n" : "");
  return eol === "\r\n" ? result.replaceAll("\n", "\r\n") : result;
}

export function patchStats(patch: string): { added: number; removed: number } {
  const lines = patchBody(patch).split("\n");
  return {
    added: lines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length,
    removed: lines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length,
  };
}
