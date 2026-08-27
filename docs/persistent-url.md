# Hướng dẫn cố định 1 Link MCP vĩnh viễn (Persistent Tunnel)

Mặc định khi mở ứng dụng, Cloudflare / Pinggy sẽ cấp một URL ngẫu nhiên tạm thời (dạng `https://random-subdomain.trycloudflare.com`). Nếu bạn muốn **dùng duy nhất 1 link cố định trọn đời**, không bao giờ phải cập nhật lại URL trong ChatGPT mỗi khi mở app, hãy chọn 1 trong 2 phương án miễn phí 100% dưới đây:

---

## 🌟 Phương án 1: Dùng Ngrok Static Domain (Dễ nhất · Miễn phí 100%)

Ngrok cung cấp sẵn **1 Domain tĩnh miễn phí vĩnh viễn** cho mỗi tài khoản cá nhân (ví dụ: `my-mcp.ngrok-free.app`).

### Các bước thực hiện (1 phút):
1. Truy cập [dashboard.ngrok.com](https://dashboard.ngrok.com) và đăng ký/đăng nhập tài khoản miễn phí.
2. Vào mục **Domains** → Bấm **Create Domain** (bạn sẽ nhận được 1 domain miễn phí, ví dụ: `unique-name.ngrok-free.app`).
3. Vào mục **Your Authtoken** → Sao chép token của bạn.
4. Mở Dashboard của app Local Secure (`http://127.0.0.1:3001/ui`):
   * Mở mục **Tùy chọn tunnel và cố định 1 Link MCP**.
   * Chọn nhà cung cấp: **Ngrok**.
   * Dán domain tĩnh vào ô: `Ngrok Static Domain` (ví dụ: `unique-name.ngrok-free.app`).
   * Dán token vào ô: `Ngrok Authtoken`.
   * Bấm **Lưu và áp dụng ngay**.
5. Bấm **▶ Chạy lại** tunnel.

👉 **Kết quả:** URL của bạn bây giờ sẽ luôn là:
`https://unique-name.ngrok-free.app/mcp/<MCP_TOKEN>`
Bạn chỉ cần dán link này vào ChatGPT **một lần duy nhất**. Mỗi khi mở lại app, link vẫn giữ nguyên 100%!

---

## 🛡️ Phương án 2: Dùng Cloudflare Named Tunnel (Tốc độ cao · Ổn định)

Cloudflare Zero Trust cho phép tạo các Named Tunnel miễn phí gắn liền với tên miền riêng của bạn.

### Các bước thực hiện:
1. Đăng nhập vào [one.dash.cloudflare.com](https://one.dash.cloudflare.com) (Cloudflare Zero Trust).
2. Vào **Networks** → **Tunnels** → Bấm **Create a Tunnel** → Chọn **Cloudflared**.
3. Đặt tên tunnel (ví dụ: `local-mcp`).
4. Tại bước Install connector, chọn hệ điều hành của bạn và sao chép phần token (chuỗi ký tự dài sau `--token`).
5. Trong phần **Public Hostname**, trỏ subdomain của bạn (ví dụ: `mcp.yourdomain.com`) về service: `HTTP://localhost:3400`.
6. Mở Dashboard Local Secure (`http://127.0.0.1:3001/ui`):
   * Mở mục **Tùy chọn tunnel và cố định 1 Link MCP**.
   * Dán Token vào ô: `Cloudflare Tunnel Token`.
   * Bấm **Lưu và áp dụng ngay**.

👉 **Kết quả:** URL kết nối cố định của bạn là:
`https://mcp.yourdomain.com/mcp/<MCP_TOKEN>`

---

## 🔒 Phương án 3: OpenAI Secure MCP Tunnel (Phương pháp bảo mật của OpenAI)

Nếu bạn không muốn tạo bất kỳ URL public nào trên Internet:
1. Trong ChatGPT, khi thêm MCP Server, chọn loại kết nối là **Tunnel** (thay vì Server URL).
2. Xem hướng dẫn chi tiết tại [docs/secure-tunnel.md](secure-tunnel.md).

---

## 📊 Bảng so sánh các phương án

| Tiêu chí | Quick Tunnel (Mặc định) | Ngrok Static Domain | Cloudflare Named Tunnel | Secure MCP Tunnel |
| :--- | :--- | :--- | :--- | :--- |
| **Độ cố định URL** | ❌ Đổi mỗi lần restart | ✅ **Cố định 1 link vĩnh viễn** | ✅ **Cố định 1 link vĩnh viễn** | ✅ **Không cần URL** |
| **Chi phí** | Miễn phí | Miễn phí (1 static domain) | Miễn phí | Miễn phí |
| **Độ dễ cấu hình** | Tự động hoàn toàn | Rất dễ (1 phút) | Cần domain Cloudflare | Trung bình |
| **Auto-reconnect** | Có | Có | Có | Tự động |
