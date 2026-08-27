import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function equalSecret(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function bearerToken(request: Request): string | undefined {
  const header = request.header("authorization");
  if (!header) return undefined;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

function basicToken(request: Request): string | undefined {
  const header = request.header("authorization");
  const match = header?.match(/^Basic\s+(.+)$/i);
  if (!match?.[1]) return undefined;
  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    return separator >= 0 ? decoded.slice(separator + 1) : undefined;
  } catch {
    return undefined;
  }
}

export function authenticateAdminRequest(request: Request, expectedToken: string): boolean {
  const candidate = bearerToken(request) || basicToken(request);
  return candidate !== undefined && equalSecret(candidate, expectedToken);
}

export function authenticateRequest(
  request: Request,
  expectedToken: string,
  urlToken?: string
): boolean {
  const candidate = bearerToken(request) || urlToken;
  return candidate !== undefined && equalSecret(candidate, expectedToken);
}

export function requireToken(expectedToken: string, allowUrlToken: boolean) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const parameter = allowUrlToken ? request.params["token"] : undefined;
    const urlToken = Array.isArray(parameter) ? parameter[0] : parameter;
    if (!authenticateRequest(request, expectedToken, urlToken)) {
      response.setHeader("WWW-Authenticate", 'Bearer realm="local-coder"');
      response.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}

export function requireAdminToken(expectedToken: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (!authenticateAdminRequest(request, expectedToken)) {
      response.setHeader("WWW-Authenticate", 'Basic realm="Local Coder Admin", charset="UTF-8"');
      response.status(401).send("Authentication required");
      return;
    }
    next();
  };
}
