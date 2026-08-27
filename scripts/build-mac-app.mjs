import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function buildMacAppBundle(projectRoot = process.cwd()) {
  const appDir = path.join(projectRoot, "Local Coder.app");
  const contentsDir = path.join(appDir, "Contents");
  const macOsDir = path.join(contentsDir, "MacOS");
  const resourcesDir = path.join(contentsDir, "Resources");

  await fs.mkdir(macOsDir, { recursive: true });
  await fs.mkdir(resourcesDir, { recursive: true });

  const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>LocalCoder</string>
  <key>CFBundleIdentifier</key>
  <string>com.chatgpt.localcoder</string>
  <key>CFBundleName</key>
  <string>Local Coder</string>
  <key>CFBundleDisplayName</key>
  <string>Local Coder</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>3.0.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
  </dict>
</dict>
</plist>
`;

  await fs.writeFile(path.join(contentsDir, "Info.plist"), infoPlist, "utf8");
  const icnsSource = path.join(projectRoot, "src", "assets", "AppIcon.icns");
  try {
    await fs.copyFile(icnsSource, path.join(resourcesDir, "AppIcon.icns"));
  } catch {}

  const swiftSource = path.join(projectRoot, "src", "native", "mac", "main.swift");
  const binaryOutput = path.join(macOsDir, "LocalCoder");

  // Biên dịch Native Swift Binary (Cocoa + WebKit)
  await execFileAsync("/usr/bin/swiftc", [
    swiftSource,
    "-O",
    "-framework", "Cocoa",
    "-framework", "WebKit",
    "-o", binaryOutput,
  ]);

  await fs.chmod(binaryOutput, 0o755).catch(() => undefined);
  return appDir;
}

if (process.argv[1] && process.argv[1].endsWith("build-mac-app.mjs")) {
  buildMacAppBundle().then((appPath) => {
    process.stdout.write(`Đã biên dịch thành công Native macOS App: ${appPath}\n`);
  }).catch((err) => {
    process.stderr.write(`Lỗi biên dịch: ${err.message}\n`);
    process.exitCode = 1;
  });
}
