import fs from "node:fs/promises";
import path from "node:path";

export interface PresetTaskItem {
  name: string;
  command: string;
  args: string[];
  description: string;
  category: "test" | "build" | "lint" | "git" | "custom";
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function detectProjectTaskPresets(workspaceRoot: string): Promise<PresetTaskItem[]> {
  const presets: PresetTaskItem[] = [];

  // 1. Node.js (package.json)
  const pkgPath = path.join(workspaceRoot, "package.json");
  if (await fileExists(pkgPath)) {
    try {
      const raw = await fs.readFile(pkgPath, "utf8");
      const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
      const scripts = parsed.scripts ?? {};

      if (scripts.test) {
        presets.push({
          name: "test",
          command: "npm",
          args: ["test"],
          description: "Chạy kiểm thử dự án (npm test)",
          category: "test",
        });
      }
      if (scripts.build) {
        presets.push({
          name: "build",
          command: "npm",
          args: ["run", "build"],
          description: "Build dự án (npm run build)",
          category: "build",
        });
      }
      if (scripts.typecheck) {
        presets.push({
          name: "typecheck",
          command: "npm",
          args: ["run", "typecheck"],
          description: "Kiểm tra kiểu TypeScript (npm run typecheck)",
          category: "lint",
        });
      }
      if (scripts.lint) {
        presets.push({
          name: "lint",
          command: "npm",
          args: ["run", "lint"],
          description: "Kiểm tra định dạng code (npm run lint)",
          category: "lint",
        });
      }
    } catch {}
  }

  // 2. Python
  const pyproject = path.join(workspaceRoot, "pyproject.toml");
  const requirements = path.join(workspaceRoot, "requirements.txt");
  if ((await fileExists(pyproject)) || (await fileExists(requirements))) {
    presets.push({
      name: "pytest",
      command: "pytest",
      args: [],
      description: "Chạy Python unit test (pytest)",
      category: "test",
    });
  }

  // 3. Rust / Cargo
  const cargoToml = path.join(workspaceRoot, "Cargo.toml");
  if (await fileExists(cargoToml)) {
    presets.push({
      name: "cargo-check",
      command: "cargo",
      args: ["check"],
      description: "Kiểm tra lỗi biên dịch Rust (cargo check)",
      category: "lint",
    });
    presets.push({
      name: "cargo-test",
      command: "cargo",
      args: ["test"],
      description: "Chạy Rust test suite (cargo test)",
      category: "test",
    });
  }

  // 4. Go
  const goMod = path.join(workspaceRoot, "go.mod");
  if (await fileExists(goMod)) {
    presets.push({
      name: "go-test",
      command: "go",
      args: ["test", "./..."],
      description: "Chạy Go unit test (go test ./...)",
      category: "test",
    });
  }

  // 5. Git Status Check
  const gitDir = path.join(workspaceRoot, ".git");
  try {
    const gitStat = await fs.stat(gitDir);
    if (gitStat.isDirectory()) {
      presets.push({
        name: "git-summary",
        command: "git",
        args: ["status", "--short"],
        description: "Kiểm tra tóm tắt thay đổi Git (git status -s)",
        category: "git",
      });
    }
  } catch {}

  return presets;
}
