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

export interface AuditAnalytics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  topTools: Array<{ name: string; count: number; percentage: number }>;
  avgDurationMs: number;
  recentActivity: Array<{ time: string; tool: string; action: string; outcome: string }>;
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

  getAnalytics(): AuditAnalytics {
    const totalCalls = this.events.length;
    let successfulCalls = 0;
    let failedCalls = 0;
    let totalDuration = 0;
    let durationCount = 0;
    const toolCounts: Record<string, number> = {};

    for (const event of this.events) {
      if (event.outcome === "ok") successfulCalls++;
      else failedCalls++;

      if (typeof event.durationMs === "number" && event.durationMs > 0) {
        totalDuration += event.durationMs;
        durationCount++;
      }

      toolCounts[event.tool] = (toolCounts[event.tool] || 0) + 1;
    }

    const topTools = Object.entries(toolCounts)
      .map(([name, count]) => ({
        name,
        count,
        percentage: totalCalls > 0 ? Math.round((count / totalCalls) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const avgDurationMs = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;
    const recentActivity = this.recent(10).map((e) => ({
      time: e.timestamp,
      tool: e.tool,
      action: e.action,
      outcome: e.outcome,
    }));

    return {
      totalCalls,
      successfulCalls,
      failedCalls,
      topTools,
      avgDurationMs,
      recentActivity,
    };
  }
}
