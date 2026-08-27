# ChatGPT Local Secure

MCP server local, giới hạn quyền, cho phép ChatGPT hoặc MCP client đọc/sửa một project được chọn, chạy task trong allowlist và dùng Git local.

Đây là bản dựng mới từ những phần tốt của `ChatGPT-Local`: giữ PathPolicy, checkpoint, capability gating, dashboard localhost và audit metadata; đồng thời siết chặt workspace, process/session limits, launcher đa nền tảng và luồng kết nối ChatGPT.

## Điểm khác biệt chính

- `WORKSPACE_PATH` bắt buộc là đường dẫn tuyệt đối tới một project cụ thể; root ổ đĩa, Home, root chồng lấn và symlink thoát workspace đều bị chặn.
- Mọi luồng đọc context đều đi qua PathPolicy; có test hồi quy cho symlink `README.md` trỏ ra ngoài.
- Search nội dung chỉ dùng literal matching, không nhận JavaScript regex tùy ý.
- Background task có giới hạn đồng thời, retention hữu hạn và shutdown theo process tree với TERM rồi KILL.
- MCP session có TTL và giới hạn số lượng; audit được nạp lại sau restart và rotate theo kích thước.
- `ALLOW_URL_TOKEN=false` mặc định. Cách kết nối ưu tiên là [OpenAI Secure MCP Tunnel](docs/secure-tunnel.md).
- Windows mở trình duyệt mặc định thay vì engine Internet Explorer cũ; `pnpm app` thực sự start server và mở dashboard.
- CI chạy Linux, macOS và Windows; `verify` gồm typecheck, test, build, production smoke và kiểm tra gói npm.

## Yêu cầu

- Node.js 22+
- Corepack
- pnpm 11.19.0 (được khóa trong `packageManager`)

## Cài nhanh

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm setup:local -- /absolute/path/to/your/project
corepack pnpm app
```

`setup:local` tạo `.env`, token mạnh và registry task tại `<workspace>/.local-coder/tasks.json`. File `.env` hiện có sẽ không bị ghi đè.

Dashboard mặc định: `http://127.0.0.1:3001/ui`. Mật khẩu là `ADMIN_TOKEN` trong `.env`.

macOS/Linux có thể dùng `./app.sh`; Windows dùng `.\app.ps1`. Cả hai sẽ mở dashboard nếu server đã chạy, hoặc start server rồi mở dashboard.

## Kết nối ChatGPT

Cho sử dụng cá nhân/private, dùng [Secure MCP Tunnel](docs/secure-tunnel.md): server vẫn chỉ listen localhost và tunnel client tạo kết nối HTTPS outbound tới OpenAI. Không cần đặt `MCP_TOKEN` trong URL public.

Public Cloudflare/Pinggy tunnel trong dashboard được giữ như chế độ thử nghiệm legacy. Muốn tạo URL `/mcp/<token>` phải chủ động đặt `ALLOW_URL_TOKEN=true`; token trong URL có thể lọt vào history hoặc log của nhà cung cấp.

Nếu triển khai MCP server public hoặc cho nhiều người dùng, static token của project này không đủ: cần HTTPS ổn định và OAuth 2.1/PKCE theo yêu cầu MCP/ChatGPT.

## Quyền mặc định

| Capability | Mặc định |
| --- | --- |
| Đọc trong workspace | Bật |
| Ghi trong workspace + checkpoint | Bật ở `workspace-write` |
| Task allowlist | Bật ở `workspace-write` khi đã cấu hình |
| Xóa/restore | Tắt |
| Git pull/push | Tắt |
| Shell tùy ý | Tắt |
| File nhạy cảm (`.env`, credential) | Tắt |
| URL token | Tắt |

Các capability bị tắt sẽ không xuất hiện trong danh sách MCP tools.

## Task allowlist

Sửa `<workspace>/.local-coder/tasks.json`:

```json
{
  "version": 1,
  "tasks": {
    "test": {
      "description": "Run the locked project test suite",
      "program": "corepack",
      "args": ["pnpm", "test"],
      "timeoutSeconds": 300
    }
  }
}
```

Tên task, schema, program, args, cwd, timeout và environment đều được kiểm tra. Lệnh chạy với `shell: false` và environment tối thiểu.

## Cổng chất lượng

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm smoke
corepack pnpm verify
corepack pnpm audit --prod
```

`verify` là cổng chuẩn dùng cả local và CI.

## Giới hạn an toàn

Path checks và allowlist giúp giảm thiệt hại do nhầm lẫn hoặc tool call từ xa, nhưng không thay thế OS sandbox. Với repository không tin cậy hoặc khi bật shell, hãy chạy trong container/VM và chỉ mount đúng project cần làm việc.

Chi tiết contract: [docs/architecture.md](docs/architecture.md).
