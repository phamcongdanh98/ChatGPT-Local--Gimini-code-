import type { NextFunction, Request, Response } from "express";

interface WindowState {
  startedAt: number;
  count: number;
}

export function rateLimit(limitPerMinute: number) {
  const windows = new Map<string, WindowState>();
  const windowMs = 60_000;

  return (request: Request, response: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || "unknown";
    const current = windows.get(key);
    const state = !current || now - current.startedAt >= windowMs
      ? { startedAt: now, count: 0 }
      : current;
    state.count += 1;
    windows.set(key, state);

    response.setHeader("RateLimit-Limit", String(limitPerMinute));
    response.setHeader("RateLimit-Remaining", String(Math.max(0, limitPerMinute - state.count)));

    if (state.count > limitPerMinute) {
      response.setHeader("Retry-After", String(Math.ceil((windowMs - (now - state.startedAt)) / 1000)));
      response.status(429).json({ error: "rate_limit_exceeded" });
      return;
    }

    if (windows.size > 5000) {
      for (const [entryKey, entry] of windows) {
        if (now - entry.startedAt >= windowMs) windows.delete(entryKey);
      }
    }
    next();
  };
}
