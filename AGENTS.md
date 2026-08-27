# ChatGPT Local Secure

## Purpose

This repository implements a least-privilege local coding MCP server. Preserve the security contract in `docs/architecture.md` when changing tools or transport behavior.

## Commands

- Install: `pnpm install --frozen-lockfile`
- Typecheck: `pnpm typecheck`
- Tests: `pnpm test`
- Production smoke: `pnpm smoke`
- Full verification: `pnpm verify`
- Development server: `pnpm dev`
- Production server: `pnpm build && pnpm start`

## Non-negotiable boundaries

- Never accept an unvalidated path in a filesystem, task or Git operation.
- Never make `WORKSPACE_PATH` optional or permit drive root/Home as a workspace.
- Do not advertise a disabled capability.
- Do not mark a state-changing tool as read-only or a destructive/external tool as safe.
- Do not log tokens, file contents, raw environment values or raw command output.
- Keep health responses free of workspace paths and authentication details.
- Generic shell, destructive tools and remote Git remain opt-in.
- URL-token authentication remains off by default; Secure MCP Tunnel is preferred.
- Keep first-run setup usable without editing `.env` or copying permanent tokens; auto-login handoff tokens must be random, in-memory and one-time.
- Add a regression test when changing path containment, auth, process lifecycle, tool annotations or output limits.
