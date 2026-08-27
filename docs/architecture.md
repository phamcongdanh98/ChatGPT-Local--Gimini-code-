# Architecture and security contract

## Outcome

A user can attach this server to ChatGPT as an MCP connector, inspect and edit an explicitly configured project, run operator-approved project tasks, and use local Git tools. The default configuration must not expose the rest of the machine or arbitrary shell execution.

```text
ChatGPT / MCP client
  -> authenticated Streamable HTTP request
  -> rate and body limits
  -> per-session MCP server
  -> capability policy
  -> symlink-aware workspace boundary
  -> file, patch, checkpoint, task, or Git service
  -> bounded structured result + redacted audit event
```

## Trust boundaries

1. **HTTP boundary:** every MCP request is authenticated before JSON parsing. Health returns only readiness and version.
2. **Tool boundary:** disabled capabilities are not advertised. Tool annotations reflect real side effects.
3. **Filesystem boundary:** all user paths are resolved against canonical workspace roots. Existing symlinks and the nearest existing parent of new paths are canonicalized before access.
4. **Process boundary:** normal task tools accept only a task name from an operator-owned JSON file and use `spawn` without a shell. Arbitrary shell is a separate opt-in capability.
5. **Git boundary:** remote operations are absent by default. Arguments are passed directly to `git`, never through a shell.
   Git hooks, global/system config, fsmonitor and commit signing are disabled for managed calls. Repository-local clean/smudge filters are still a reason to use an OS sandbox for untrusted repositories.
6. **Observability boundary:** audit events record operation metadata, never file contents, tokens, environment values, or raw command output.
7. **Tunnel boundary:** OpenAI Secure MCP Tunnel is the preferred private connection and uses an outbound HTTPS tunnel client. The legacy dashboard tunnel forwards only the configured MCP port, strips MCP/admin tokens from the child environment and accepts only allowlisted HTTPS hostnames. The admin listener remains loopback-only.
8. **Admin mutation boundary:** configuration writes require an authenticated browser session plus a custom same-origin action header. Only allowlisted keys can change; paths are canonicalized, broad roots are rejected, `.env` symlinks are rejected, and updates use an atomic mode-0600 replacement.
9. **Secret display boundary:** the MCP token is never included in status, diagnostics, logs or page HTML. An authenticated explicit POST may reveal it to the local browser for display/copy, with no-store responses and no browser persistence.

## Capability modes

| Capability | Default | Enforced behavior |
| --- | --- | --- |
| Read configured roots | On | Canonical path containment and output limits |
| Write configured roots | On in `workspace-write` | Atomic writes plus checkpoint |
| Sensitive files | Off | `.env*`, credential filenames, `.git` metadata and state directory denied |
| Delete/restore | Off | Tools omitted unless `ALLOW_DESTRUCTIVE=true` |
| Project tasks | On in `workspace-write` when configured | Protected task registry; exact program/args/cwd; sanitized environment |
| Arbitrary shell | Off | Tool omitted unless `ALLOW_UNSAFE_SHELL=true` |
| Git remote operations | Off | Tools omitted unless `ALLOW_REMOTE_GIT=true` |
| Admin dashboard | Off | Loopback-only, login rate limit, separate token, bounded HttpOnly sessions, CSRF-style action header and allowlisted configuration mutations |

Code-level path checks reduce accidental and remote-tool damage but are not an OS sandbox. For untrusted repositories or arbitrary shell, run the server inside a container or VM and mount only the intended project.

## Limits and cleanup

- HTTP bodies, file reads/writes, search results and process logs are bounded.
- Sessions expire after an idle TTL.
- Sessions and concurrent background tasks have hard count limits.
- Background tasks have timeouts, bounded logs, bounded completed-task retention and process-tree shutdown.
- Audit history reloads after restart and rotates at a configured byte ceiling.
- Checkpoints have bounded retention and never include the server state directory.
- Server shutdown closes transports, tasks, admin HTTP and MCP HTTP listeners.
- Server shutdown also terminates a dashboard-started tunnel; configuration changes replace the MCP runtime and close existing MCP sessions.
- Browser admin sessions are in-memory, capped at eight, expire after 12 hours and disappear on restart.

## Deliberate exclusions from v3 core

- Upstream MCP aggregation is excluded so one connector cannot silently widen authority to unrelated services.
- The dashboard cannot edit arbitrary environment values, add arbitrary commands or tunnel the admin port. It can change only the primary workspace and explicit capability flags.
- OAuth is not bundled. Static bearer authentication is for local/private use. URL-token compatibility is off by default and legacy-only; public/multi-user deployment requires OAuth 2.1/PKCE or an authenticated private proxy.
