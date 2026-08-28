param([string]$Provider = "")

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($Provider)) {
  if (Get-Command ngrok -ErrorAction SilentlyContinue) { $Provider = "ngrok" }
  elseif (Get-Command cloudflared -ErrorAction SilentlyContinue) { $Provider = "cloudflared" }
  else { $Provider = "pinggy" }
}
if ($Provider -notin @("pinggy", "cloudflared", "ngrok")) { throw "Provider phải là pinggy, cloudflared hoặc ngrok" }
corepack pnpm tunnel -- $Provider
