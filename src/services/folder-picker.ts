import { runProcess } from "../lib/process.js";
import { tunnelEnvironment } from "../cli/tunnel.js";

export interface FolderPickerCommand {
  program: string;
  args: string[];
}

export function buildFolderPickerCommand(platform = process.platform): FolderPickerCommand | undefined {
  if (platform === "darwin") {
    return {
      program: "/usr/bin/osascript",
      args: ["-e", 'POSIX path of (choose folder with prompt "Chọn project cho Local Coder")'],
    };
  }
  if (platform === "win32") {
    return {
      program: "powershell.exe",
      args: [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-STA",
        "-Command",
        "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; $f=New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description='Chọn thư mục project cho Local Coder'; $f.ShowNewFolderButton=$true; $t=New-Object System.Windows.Forms.Form; $t.TopMost=$true; $t.ShowInTaskbar=$false; $r=$f.ShowDialog($t); $t.Dispose(); if($r -eq 'OK'){[Console]::Write($f.SelectedPath)}",
      ],
    };
  }
  if (platform === "linux") {
    return { program: "zenity", args: ["--file-selection", "--directory", "--title=Chọn project cho Local Coder"] };
  }
  return undefined;
}

export async function pickWorkspaceFolder(platform = process.platform): Promise<string | undefined> {
  const command = buildFolderPickerCommand(platform);
  if (!command) throw new Error("Hệ điều hành này chưa hỗ trợ hộp chọn thư mục");
  const result = await runProcess({
    program: command.program,
    args: command.args,
    cwd: process.cwd(),
    env: tunnelEnvironment(process.env),
    timeoutMs: 45 * 1000,
    outputMaxBytes: 8 * 1024,
  });
  if (result.timedOut) throw new Error("Hộp chọn thư mục đã hết thời gian chờ");
  if (result.exitCode !== 0) return undefined;
  const selected = result.stdout.trim().replace(/[\\/]$/, "");
  return selected || undefined;
}
