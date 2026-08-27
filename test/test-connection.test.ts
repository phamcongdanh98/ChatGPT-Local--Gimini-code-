import assert from "node:assert/strict";
import test from "node:test";
import { buildDesktopAppCommand } from "../src/cli/desktop.js";

test("desktop app launcher command targets the correct platform browser or opener", () => {
  const macCommand = buildDesktopAppCommand({
    url: "http://127.0.0.1:3001/ui",
    platform: "darwin",
  });
  assert.equal(macCommand.program, "/usr/bin/open");
  assert.ok(macCommand.args.includes("http://127.0.0.1:3001/ui"));

  const winCommand = buildDesktopAppCommand({ url: "http://127.0.0.1:3001/ui", platform: "win32" });
  assert.equal(winCommand.program, "rundll32.exe");
  assert.deepEqual(winCommand.args, ["url.dll,FileProtocolHandler", "http://127.0.0.1:3001/ui"]);

  const linuxCommand = buildDesktopAppCommand({ url: "http://127.0.0.1:3001/ui", platform: "linux" });
  assert.equal(linuxCommand.program, "xdg-open");
  assert.deepEqual(linuxCommand.args, ["http://127.0.0.1:3001/ui"]);
});
