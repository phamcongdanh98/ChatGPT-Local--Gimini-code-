import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

export interface AuditEvent {
  id: string;
  timestamp: string;
  tool: string;
  action: string;
  outcome: "ok" | "denied" | "error";
  target?: string;
  durationMs?: number;
  detail?: Record<string, string | number | boolean | null>;
}

export class AuditLog extends EventEmitter {
  private readonly events: AuditEvent[] = [];
  private readonly filePath: string;
  private readonly maxEvents: number;
  private readonly maxBytes: number;
  private writeQueue = Promise.resolve();

  constructor(stateDir: string, maxEvents = 250, maxBytes = 5 * 1024 * 1024) {
    super();
    this.filePath = path.join(stateDir, "audit.jsonl");
    this.maxEvents = maxEvents;
    this.maxBytes = maxBytes;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const handle = await fs.open(this.filePath, "a", 0o600);
    await handle.close();
    await fs.chmod(this.filePath, 0o600).catch(() => undefined);
    const stat = await fs.stat(this.filePath);
    const bytesToRead = Math.min(stat.size, this.maxBytes);
    const buffer = Buffer.alloc(bytesToRead);
    const readHandle = await fs.open(this.filePath, "r");
    await readHandle.read(buffer, 0, bytesToRead, stat.size - bytesToRead);
    await readHandle.close();
    let content = buffer.toString("utf8");
    if (stat.size > bytesToRead) content = content.slice(content.indexOf("\n") + 1);
    for (const line of content.trim().split("\n").slice(-this.maxEvents)) {
      if (!line) continue;
      try {
        const event = JSON.parse(line) as AuditEvent;
        if (event && typeof event.id === "string" && typeof event.timestamp === "string") this.events.push(event);
      } catch {
        // Ignore a partial final line left by an interrupted write.
      }
    }
  }

  async record(input: Omit<AuditEvent, "id" | "timestamp">): Promise<AuditEvent> {
    const event: AuditEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...input,
    };
    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.shift();
    this.emit("event", event);
    const line = `${JSON.stringify(event)}\n`;
    const write = this.writeQueue.then(async () => {
      const stat = await fs.stat(this.filePath);
      if (stat.size + Buffer.byteLength(line) > this.maxBytes) {
        const rotated = `${this.filePath}.1`;
        await fs.rm(rotated, { force: true });
        await fs.rename(this.filePath, rotated);
        await fs.writeFile(this.filePath, "", { mode: 0o600 });
      }
      await fs.appendFile(this.filePath, line, { encoding: "utf8", mode: 0o600 });
    });
    this.writeQueue = write.catch(() => undefined);
    await write;
    return event;
  }

  recent(limit = 50): AuditEvent[] {
    return this.events.slice(-Math.max(1, Math.min(limit, 200))).reverse();
  }
}
