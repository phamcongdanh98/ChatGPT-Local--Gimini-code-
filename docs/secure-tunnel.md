# OpenAI Secure MCP Tunnel

Đây là cách kết nối được khuyến nghị cho server local/private. `tunnel-client` tạo kết nối HTTPS outbound tới OpenAI, vì vậy MCP server có thể tiếp tục listen trên `127.0.0.1` và không cần public endpoint.

## 1. Start local server

```bash
corepack pnpm app
```

MCP endpoint mặc định là `http://127.0.0.1:3000/mcp`. Giữ `ALLOW_URL_TOKEN=false`.

## 2. Khởi tạo tunnel profile

Cài `tunnel-client` theo tài liệu OpenAI, sau đó tạo profile bằng tunnel ID và URL local của bạn:

```bash
tunnel-client init \
  --sample local-coder \
  --profile chatgpt-local-secure \
  --tunnel-id YOUR_TUNNEL_ID \
  --mcp-server-url http://127.0.0.1:3000/mcp
```

Không lưu runtime API key vào repository hoặc `.env` của MCP server. Chỉ cung cấp key cho process `tunnel-client` theo hướng dẫn của OpenAI.

## 3. Kiểm tra và chạy

```bash
tunnel-client doctor --profile chatgpt-local-secure --explain
tunnel-client run --profile chatgpt-local-secure
```

Trong ChatGPT, tạo/kết nối MCP app bằng loại **Tunnel**, rồi chọn hoặc dán `tunnel_id`.

## Khi nào không dùng

Secure MCP Tunnel dành cho kết nối private/local. Nó không phải đường deploy cho plugin public. MCP server public cần stable HTTPS và authentication phù hợp; với nhiều người dùng, triển khai OAuth 2.1/PKCE thay vì static token.

Tài liệu chính thức:

- [Secure MCP Tunnels](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [Connect from ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Authentication for published MCP servers](https://developers.openai.com/plugins/build/auth)
