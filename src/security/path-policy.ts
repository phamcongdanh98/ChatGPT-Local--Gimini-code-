import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface ResolveOptions {
  mustExist?: boolean;
  allowSensitive?: boolean;
}

function normalizedForComparison(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isWithin(root: string, candidate: string): boolean {
  const normalizedRoot = normalizedForComparison(root);
  const normalizedCandidate = normalizedForComparison(candidate);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

async function exists(value: string): Promise<boolean> {
  try {
    await fs.lstat(value);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function canonicalizePotentialPath(absolutePath: string): Promise<{ canonical: string; existed: boolean }> {
  if (await exists(absolutePath)) {
    return { canonical: await fs.realpath(absolutePath), existed: true };
  }

  const missingSegments: string[] = [];
  let cursor = absolutePath;
  while (!(await exists(cursor))) {
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error("No existing ancestor for path");
    missingSegments.unshift(path.basename(cursor));
    cursor = parent;
  }
  const canonicalParent = await fs.realpath(cursor);
  return { canonical: path.resolve(canonicalParent, ...missingSegments), existed: false };
}

function looksSensitive(candidate: string): boolean {
  const base = path.basename(candidate).toLowerCase();
  if (base === ".env" || (base.startsWith(".env.") && !base.endsWith(".example"))) return true;
  return new Set([
    ".npmrc",
    ".pypirc",
    ".git-credentials",
    "id_rsa",
    "id_ed25519",
    "credentials.json",
    "service-account.json",
  ]).has(base);
}

function isInternalMetadata(candidate: string): boolean {
  const segments = path.resolve(candidate).split(path.sep).map((segment) => segment.toLowerCase());
  return segments.some((segment) => [".git", ".ssh", ".aws", ".gnupg"].includes(segment));
}

export class PathPolicy {
  readonly roots: string[];
  readonly primaryRoot: string;
  readonly workspaceName: string;
  readonly stateDir: string;
  readonly allowSensitiveFiles: boolean;

  private constructor(roots: string[], stateDir: string, allowSensitiveFiles: boolean) {
    this.roots = roots;
    this.primaryRoot = roots[0] as string;
    this.workspaceName = path.basename(this.primaryRoot);
    this.stateDir = stateDir;
    this.allowSensitiveFiles = allowSensitiveFiles;
  }

  static async create(
    configuredRoots: string[],
    stateDir: string,
    allowSensitiveFiles: boolean
  ): Promise<PathPolicy> {
    const canonicalRoots: string[] = [];
    for (const configuredRoot of configuredRoots) {
      const canonical = await fs.realpath(configuredRoot);
      const stat = await fs.stat(canonical);
      if (!stat.isDirectory()) throw new Error(`Workspace root is not a directory: ${configuredRoot}`);
      const filesystemRoot = path.parse(canonical).root;
      const home = await fs.realpath(os.homedir()).catch(() => path.resolve(os.homedir()));
      if (normalizedForComparison(canonical) === normalizedForComparison(filesystemRoot)
        || normalizedForComparison(canonical) === normalizedForComparison(home)) {
        throw new Error("Workspace roots cannot grant access to an entire drive or the Home directory");
      }
      canonicalRoots.push(canonical);
    }
    const uniqueRoots = [...new Set(canonicalRoots.map(normalizedForComparison))].map((normalized) => {
      return canonicalRoots.find((candidate) => normalizedForComparison(candidate) === normalized) as string;
    });
    if (uniqueRoots.length === 0) throw new Error("No valid workspace roots configured");
    for (let index = 0; index < uniqueRoots.length; index += 1) {
      for (let other = index + 1; other < uniqueRoots.length; other += 1) {
        const left = uniqueRoots[index] as string;
        const right = uniqueRoots[other] as string;
        if (isWithin(left, right) || isWithin(right, left)) {
          throw new Error("Workspace roots must not overlap");
        }
      }
    }

    const resolvedStateDir = (await canonicalizePotentialPath(path.resolve(stateDir))).canonical;
    if (!uniqueRoots.some((root) => isWithin(root, resolvedStateDir))) {
      throw new Error("STATE_DIR must be inside a configured workspace root");
    }
    return new PathPolicy(uniqueRoots, resolvedStateDir, allowSensitiveFiles);
  }

  async resolve(inputPath: string, options: ResolveOptions = {}): Promise<string> {
    if (!inputPath || inputPath.includes("\0")) throw new Error("Path is empty or invalid");
    let cleaned = inputPath.trim();
    if (/^root0[\/\\]/i.test(cleaned)) {
      cleaned = cleaned.replace(/^root0[\/\\]/i, "");
    } else if (
      this.workspaceName &&
      (cleaned.toLowerCase().startsWith(`${this.workspaceName.toLowerCase()}/`) ||
       cleaned.toLowerCase().startsWith(`${this.workspaceName.toLowerCase()}\\`))
    ) {
      cleaned = cleaned.slice(this.workspaceName.length + 1);
    }
    const absolute = path.isAbsolute(cleaned)
      ? path.resolve(cleaned)
      : path.resolve(this.primaryRoot, cleaned);
    const { canonical, existed } = await canonicalizePotentialPath(absolute);

    if (!this.roots.some((root) => isWithin(root, canonical))) {
      throw new Error("Path is outside configured workspace roots");
    }
    if (isWithin(this.stateDir, canonical)) {
      throw new Error("The .local-coder state directory is not accessible through MCP tools");
    }
    if (isInternalMetadata(canonical)) {
      throw new Error("Internal repository or credential metadata is not accessible through file tools");
    }
    if (!(options.allowSensitive ?? this.allowSensitiveFiles) && looksSensitive(canonical)) {
      throw new Error("Sensitive file access is disabled");
    }
    if (options.mustExist && !existed) throw new Error("Path does not exist");
    return canonical;
  }

  label(candidate: string): string {
    const rootIndex = this.roots.findIndex((root) => isWithin(root, candidate));
    if (rootIndex < 0) return "outside-workspace";
    const relative = path.relative(this.roots[rootIndex] as string, candidate) || ".";
    return `root${rootIndex}/${relative.replaceAll(path.sep, "/")}`;
  }

  isInside(candidate: string): boolean {
    return this.roots.some((root) => isWithin(root, candidate));
  }
}
