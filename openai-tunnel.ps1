param([string]$Provider = "")

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($Provider)) {
  if (Get-Command cloudflared -ErrorAction SilentlyContinue) { $Provider = "cloudflared" } else { $Provider = "pinggy" }
}
if ($Provider -notin @("pinggy", "cloudflared")) { throw "Provider phải là pinggy hoặc cloudflared" }
corepack pnpm tunnel -- $Provider
