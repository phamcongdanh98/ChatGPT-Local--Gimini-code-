$ErrorActionPreference = "Stop"

try {
  corepack enable
} catch {
  # Bỏ qua nếu corepack đã được bật hoặc không đủ quyền Admin
}

if ((-not (Test-Path "node_modules\.bin\tsc.cmd")) -and (-not (Test-Path "node_modules\.bin\tsc"))) {
  Write-Host "Đang cài thành phần cần thiết (chỉ làm một lần)..."
  corepack pnpm install --frozen-lockfile
}

$ErrorActionPreference = "SilentlyContinue"

$adminPort = "3301"
$mcpPort = "3300"
if (Test-Path ".env") {
  $envContent = Get-Content ".env"
  foreach ($line in $envContent) {
    if ($line -match '^ADMIN_PORT=(.*)$') {
      $adminPort = $matches[1].Trim(' "\r')
    }
    if ($line -match '^PORT=(.*)$') {
      $mcpPort = $matches[1].Trim(' "\r')
    }
  }
}

try {
  $res = Invoke-RestMethod -Uri "http://127.0.0.1:$mcpPort/healthz" -TimeoutSec 1
  if ($res) {
    Write-Host "⚡ Server đang chạy. Đang mở dashboard Local Coder..."
    corepack pnpm dashboard
    exit 0
  }
} catch {
  # Server chưa chạy, tiếp tục khởi động
}

$ErrorActionPreference = "Stop"
corepack pnpm app
