export const ADMIN_HTML = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Local Secure · MCP Server</title>
  <link rel="icon" type="image/png" href="/assets/logo.png">
  <link rel="stylesheet" href="/assets/admin.css">
</head>
<body>
  <main class="page">
    <header class="header">
      <div class="brand"><img src="/assets/logo.png" class="logo-3d" alt="Local Secure Logo"><div><strong>Local Secure</strong><small>MCP · macOS / Windows / Linux</small></div></div>
      <div class="header-actions"><span id="server-state" class="status-pill good">● Server đang chạy</span><button id="refresh" class="button ghost">Làm mới</button><form method="post" action="/logout"><button class="link-button" type="submit">Đăng xuất</button></form></div>
    </header>

    <section class="hero">
      <p class="eyebrow">LOCAL-FIRST · LEAST PRIVILEGE</p>
      <h1>Kết nối ChatGPT với code trên máy</h1>
      <p>Chọn phương thức kết nối, cấp đúng quyền cho project, rồi dán URL vào ChatGPT.</p>
    </section>

    <section class="main-grid">
      <article class="card connection-card">
        <div class="card-head">
          <div><span class="step">BƯỚC 1</span><h2>URL kết nối ChatGPT</h2></div>
          <span id="tunnel-badge" class="status-pill">Chưa chạy</span>
        </div>

        <div class="quick-note">
          <strong id="connection-message">Vui lòng chọn nhà cung cấp và bấm "Bắt đầu kết nối"</strong>
          <span id="connection-submessage">Chọn Ngrok nếu muốn 1 link cố định vĩnh viễn, hoặc Cloudflare để tạo link nhanh tự động.</span>
        </div>

        <!-- Provider Selection Tabs -->
        <div class="provider-section">
          <span class="section-label">Chọn nhà cung cấp Tunnel:</span>
          <div class="provider-tabs">
            <button type="button" class="provider-tab" data-provider="ngrok" id="tab-ngrok">
              <div class="tab-badge">⭐ Khuyên dùng</div>
              <strong>Ngrok</strong>
              <small>Cố định 1 link vĩnh viễn</small>
            </button>
            <button type="button" class="provider-tab" data-provider="cloudflared" id="tab-cloudflared">
              <strong>Cloudflare</strong>
              <small>Tự động tạo URL nhanh</small>
            </button>
            <button type="button" class="provider-tab" data-provider="pinggy" id="tab-pinggy">
              <strong>Pinggy</strong>
              <small>Dự phòng qua SSH</small>
            </button>
          </div>
        </div>

        <!-- Dynamic Provider Inputs -->
        <div id="panel-ngrok" class="provider-inputs">
          <label class="field">
            <span>Ngrok Static Domain (Domain tĩnh miễn phí)</span>
            <input id="ngrok-domain" placeholder="ví dụ: my-app.ngrok-free.app">
            <small>💡 Lấy domain miễn phí tại <a href="https://dashboard.ngrok.com/domains" target="_blank" rel="noreferrer" style="color:var(--blue)">dashboard.ngrok.com/domains</a> (Create Domain).</small>
          </label>
          <label class="field">
            <span>Ngrok Authtoken</span>
            <input id="ngrok-token" type="password" placeholder="Token từ dashboard.ngrok.com/get-started/your-authtoken">
          </label>
        </div>

        <div id="panel-cloudflared" class="provider-inputs" hidden>
          <label class="field">
            <span>Cloudflare Tunnel Token (Tùy chọn)</span>
            <input id="cf-tunnel-token" type="password" placeholder="Để trống để dùng Quick Tunnel ngẫu nhiên tự động">
            <small>Nếu bạn có Cloudflare Zero Trust Named Tunnel, dán token vào đây để cố định tên miền riêng.</small>
          </label>
        </div>

        <div id="panel-pinggy" class="provider-inputs" hidden>
          <p class="muted">Pinggy sử dụng giao thức SSH để tạo URL public tạm thời mà không cần cài thêm binary.</p>
        </div>

        <p id="tunnel-error" class="inline-error" hidden></p>

        <!-- Tunnel Action Buttons -->
        <div class="button-row tunnel-action-row">
          <button id="start-tunnel" class="button primary big-btn">▶ Bắt đầu kết nối</button>
          <button id="stop-tunnel" class="button danger big-btn" disabled>■ Dừng kết nối</button>
        </div>

        <!-- Result URL Output -->
        <label class="field featured">
          <span>URL kết nối dán vào ChatGPT</span>
          <div class="input-action">
            <input id="connector-url" type="text" readonly placeholder="Bấm 'Bắt đầu kết nối' để tạo URL…">
            <button id="copy-connector" class="button primary" disabled>Sao chép URL</button>
          </div>
          <small id="connector-hint">URL đầy đủ sẽ xuất hiện tại đây khi kết nối thành công.</small>
        </label>

        <button id="test-connection" class="button ghost wide test-conn-btn">⚡ Kiểm tra kết nối Máy local ↔ ChatGPT</button>
        <div id="test-connection-panel" class="test-conn-panel" hidden>
          <div class="test-panel-header">
            <strong id="test-panel-summary">Đang kiểm tra kết nối…</strong>
            <button id="close-test-panel" class="link-button" type="button">Đóng</button>
          </div>
          <div id="test-panel-steps" class="test-panel-steps"></div>
        </div>

        <details class="advanced-panel">
          <summary>Tùy chọn nâng cao & Token bảo mật</summary>
          <label class="toggle-row" style="margin-top:10px;border-radius:9px;">
            <span><strong>Tự động mở tunnel khi khởi động app</strong><small>Bật nếu muốn app tự kết nối ngay khi mở</small></span>
            <input id="auto-start-tunnel" type="checkbox"><i></i>
          </label>
          <label class="field" style="margin-top:12px;">
            <span>URL public thô (không kèm token)</span>
            <div class="input-action"><input id="pinggy-url" readonly placeholder="Chưa có URL"><button id="copy-pinggy" class="button ghost" disabled>Sao chép</button></div>
          </label>
          <label class="field">
            <span>MCP_TOKEN</span>
            <div class="input-action"><input id="mcp-token" type="password" readonly value="••••••••••••••••••••••••"><button id="reveal-token" class="button ghost">Hiện</button><button id="copy-token" class="button ghost">Sao chép</button></div>
          </label>
        </details>
      </article>

      <article class="card settings-card">
        <div class="card-head"><div><span class="step">BƯỚC 2</span><h2>Project và quyền</h2></div><span id="save-state" class="saved">Đã lưu</span></div>
        <label class="field">
          <span>Thư mục project ChatGPT được truy cập</span>
          <div class="input-action"><input id="workspace-path" autocomplete="off" spellcheck="false"><button id="pick-folder" class="button ghost">📁 Chọn thư mục</button></div>
          <small>Không thể chọn toàn bộ ổ đĩa hoặc thư mục Home.</small>
        </label>
        <div id="recent-workspaces-section" class="recent-section">
          <span class="recent-title">Dự án gần đây:</span>
          <div id="recent-list" class="recent-chips"></div>
        </div>
        <div class="permissions">
          <label class="toggle-row"><span><strong>Đọc code</strong><small>Luôn bật trong workspace đã chọn</small></span><input type="checkbox" checked disabled><i></i></label>
          <label class="toggle-row"><span><strong>Tự sửa code + chạy task + Git local</strong><small>Cho phép tạo/sửa file và chạy task trong allowlist</small></span><input id="allow-write" type="checkbox"><i></i></label>
          <details class="permission-advanced"><summary>Quyền nâng cao · mặc định đang tắt</summary>
          <label class="toggle-row risky"><span><strong>Xóa file và khôi phục checkpoint</strong><small>Có thể thay đổi hoặc loại bỏ dữ liệu</small></span><input id="allow-destructive" type="checkbox"><i></i></label>
          <label class="toggle-row risky"><span><strong>Git pull / push</strong><small>Có thể gửi code ra remote</small></span><input id="allow-remote-git" type="checkbox"><i></i></label>
          <label class="toggle-row risky"><span><strong>Shell tùy ý</strong><small>Quyền rất cao; chỉ bật với project bạn tin tưởng</small></span><input id="allow-shell" type="checkbox"><i></i></label>
          <label class="toggle-row risky"><span><strong>Đọc file nhạy cảm</strong><small>Bao gồm .env và credential trong workspace</small></span><input id="allow-sensitive" type="checkbox"><i></i></label>
          </details>
        </div>
        <button id="save-settings" class="button primary wide">Lưu cài đặt project</button>
        <p class="notice">Sau khi đổi quyền hoặc project: Refresh connector trong ChatGPT để nhận đúng danh sách tool.</p>
      </article>
    </section>

    <section class="info-grid">
      <article class="card compact">
        <div class="card-head"><div><span class="step">CHATGPT</span><h2>Để ít hỏi xác nhận</h2></div></div>
        <p>Checkbox phía trên chỉ cấp quyền cho local server. Trong ChatGPT, vào <b>Settings → Apps → Local Coder → App permissions</b>, chọn <b>Never ask</b> nếu tài khoản của bạn có tùy chọn đó.</p>
        <p class="warning">Không nên dùng Never ask khi bật Shell, Git remote hoặc file nhạy cảm.</p>
      </article>
      <article class="card compact">
        <div class="card-head"><div><span class="step">KIỂM TRA</span><h2>Trạng thái nhanh</h2></div><button id="diagnostics" class="button ghost">Kiểm tra</button></div>
        <div id="stats" class="stats" aria-live="polite"></div>
        <div id="diagnostic-results" class="diagnostics" hidden></div>
      </article>
    </section>

    <section class="info-grid">
      <article class="card compact">
        <div class="card-head"><div><span class="step">ALLOWLIST</span><h2>Task được chạy</h2></div><span id="task-count" class="count">0</span></div>
        <div id="tasks" class="rows"></div>
        <div id="preset-tasks-section" class="preset-section">
          <span class="preset-title">💡 Gợi ý task theo dự án:</span>
          <div id="preset-list" class="preset-chips"></div>
        </div>
      </article>
      <article class="card compact">
        <div class="card-head"><div><span class="step">AUDIT & CHECKPOINTS</span><h2>Lịch sử sửa đổi code</h2></div><span id="checkpoint-count" class="count">0 checkpoint</span></div>
        <div id="activity" class="rows"></div>
      </article>
    </section>

    <div id="diff-modal" class="modal-backdrop" hidden>
      <div class="modal-card">
        <div class="modal-header">
          <div>
            <span class="step">CHECKPOINT DIFF</span>
            <h2 id="diff-modal-title">Chi tiết thay đổi code</h2>
          </div>
          <button id="close-diff-modal" class="button ghost">✕ Đóng</button>
        </div>
        <div id="diff-modal-body" class="diff-content"></div>
        <div class="modal-footer">
          <button id="restore-checkpoint-btn" class="button danger">↩ Hoàn tác Checkpoint này</button>
        </div>
      </div>
    </div>

    <footer>🔒 Token chỉ hiện sau khi bạn bấm · Không tunnel cổng Admin · Không lưu secret trong trình duyệt</footer>
  </main>
  <div id="toast" class="toast" role="status" hidden></div>
  <script src="/assets/admin.js" defer></script>
</body>
</html>`;

export function adminLoginHtml(invalid = false): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Đăng nhập · Local Secure</title><link rel="icon" type="image/png" href="/assets/logo.png"><link rel="stylesheet" href="/assets/admin.css"></head><body class="login-body"><main class="login-card"><div style="text-align:center"><img src="/assets/logo.png" class="logo-3d-large" alt="Local Secure Logo"></div><p class="eyebrow" style="text-align:center">LOCALHOST ADMIN</p><h1 style="text-align:center">Local Secure</h1><p style="text-align:center">Nhập <code>ADMIN_TOKEN</code> trong file <code>.env</code>.</p>${invalid ? '<div class="login-error" role="alert">Token không đúng. Hãy kiểm tra lại ADMIN_TOKEN.</div>' : ''}<form method="post" action="/login"><label for="admin-token">Admin token</label><input id="admin-token" name="token" type="password" minlength="32" required autofocus autocomplete="current-password"><button class="button primary wide" type="submit">Mở dashboard</button></form><small style="display:block;text-align:center;margin-top:12px">Dashboard chỉ chạy trên máy local.</small></main></body></html>`;
}

export const ADMIN_STYLESHEET = `
:root{color-scheme:dark;--bg:#0a0d12;--panel:#111720;--panel2:#171f2a;--line:#293442;--text:#f4f7f9;--muted:#91a0ad;--green:#5ce0b5;--green2:#0a3328;--blue:#82b5ff;--yellow:#f6c66f;--red:#ff8b8b;--sans:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--mono:"SFMono-Regular",Consolas,monospace}
*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;min-width:320px;background:radial-gradient(circle at 50% -20%,#172431 0,transparent 42%),var(--bg);color:var(--text);font-family:var(--sans);-webkit-font-smoothing:antialiased}.page{width:min(1120px,calc(100% - 32px));margin:0 auto}.header{height:72px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}.brand,.header-actions{display:flex;align-items:center;gap:11px}.brand strong,.brand small{display:block}.brand strong{font-size:14px}.brand small{font-size:10px;color:var(--muted);margin-top:2px}.logo-3d{width:42px;height:42px;border-radius:12px;box-shadow:0 4px 16px rgba(92,224,181,.25);object-fit:cover;border:1px solid rgba(92,224,181,.3);transition:.2s}.logo-3d:hover{transform:scale(1.06);box-shadow:0 6px 20px rgba(92,224,181,.45)}.logo-3d-large{width:68px;height:68px;border-radius:18px;box-shadow:0 8px 24px rgba(92,224,181,.35);margin-bottom:8px;border:1.5px solid rgba(92,224,181,.4)}.hero{padding:42px 0 24px}.hero h1{font-size:clamp(30px,5vw,48px);line-height:1.03;letter-spacing:-.05em;margin:0 0 12px}.hero>p:last-child{color:var(--muted);font-size:14px;margin:0}.eyebrow,.step{display:block;color:var(--green);font-size:9px;font-weight:900;letter-spacing:.16em;margin:0 0 8px}.main-grid{display:grid;grid-template-columns:1.08fr .92fr;gap:14px}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}.card{border:1px solid var(--line);border-radius:16px;background:rgba(17,23,32,.96);padding:20px;box-shadow:0 18px 50px rgba(0,0,0,.15)}.card.compact{padding:0}.card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}.compact .card-head{padding:20px 20px 0}.card h2{font-size:17px;letter-spacing:-.025em;margin:0}.muted,.notice,.compact>p{color:var(--muted);font-size:11px;line-height:1.6}.button,.link-button{font:750 11px var(--sans);cursor:pointer}.button{border:1px solid var(--line);border-radius:9px;padding:10px 13px;background:var(--panel2);color:var(--text);transition:.15s}.button:hover:not(:disabled){filter:brightness(1.15)}.button.primary{background:var(--green);border-color:var(--green);color:var(--green2);font-weight:800}.button.ghost{background:var(--panel2)}.button.danger{background:#2a1515;border-color:#6d3434;color:var(--red)}.button.wide{width:100%;margin-top:15px}.button.big-btn{padding:12px 18px;font-size:12px}.button:disabled{opacity:.42;cursor:not-allowed}.link-button{border:0;background:transparent;color:var(--muted);padding:8px 0;cursor:pointer}.button-row{display:flex;gap:8px;margin:14px 0}.status-pill,.saved,.count{border:1px solid var(--line);border-radius:99px;padding:5px 8px;color:var(--muted);font:800 9px var(--sans)}.status-pill.good{color:var(--green);border-color:#276a54;background:rgba(92,224,181,.1)}.status-pill.warn{color:var(--yellow);border-color:#66532f;background:rgba(246,198,111,.1)}.status-pill.bad{color:var(--red);border-color:#673939;background:rgba(255,139,139,.1)}.saved{color:var(--green);border:0}.field{display:block;margin:12px 0}.field>span{display:block;color:var(--muted);font-size:10px;font-weight:750;margin-bottom:6px}.field>small{display:block;color:var(--muted);font-size:9px;margin-top:5px;line-height:1.4}.input-action{display:flex;gap:7px}.input-action input{min-width:0;flex:1}.field.featured{border:1px solid #2b6a57;border-radius:12px;background:#0c1d19;padding:14px;margin-top:16px}.field.featured>span{color:var(--green);font-size:11px;font-weight:800}input{width:100%;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--blue);padding:11px 12px;font:11px var(--mono);outline:none;transition:.15s}input:focus{border-color:var(--green)}.permissions{border:1px solid var(--line);border-radius:11px;overflow:hidden}.toggle-row{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;background:var(--panel);border-bottom:1px solid var(--line);cursor:pointer}.toggle-row:last-child{border-bottom:0}.toggle-row.risky{background:#171614}.toggle-row span{min-width:0}.toggle-row strong,.toggle-row small{display:block}.toggle-row strong{font-size:11px}.toggle-row small{color:var(--muted);font-size:9px;margin-top:3px}.toggle-row input{position:absolute;opacity:0;pointer-events:none}.toggle-row i{width:36px;height:20px;border-radius:99px;background:#303a45;position:relative;flex:0 0 auto}.toggle-row i:after{content:"";position:absolute;width:14px;height:14px;left:3px;top:3px;border-radius:50%;background:#9ba7b1;transition:.15s}.toggle-row input:checked+i{background:#286f58}.toggle-row input:checked+i:after{left:19px;background:var(--green)}.toggle-row input:disabled+i{opacity:.6}.notice{border:1px solid #45536a;background:#121a27;border-radius:9px;padding:10px;margin:12px 0 0}.warning{border:1px solid #5b4927;background:#201b12;border-radius:9px;padding:10px!important;margin:10px 20px 20px!important;color:var(--yellow)!important}.compact>p{padding:0 20px;margin:0 0 13px}.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:0 20px 20px}.stat{border:1px solid var(--line);border-radius:10px;background:var(--panel2);padding:11px}.stat small,.stat strong{display:block}.stat small{font-size:8px;color:var(--muted);margin-bottom:5px}.stat strong{font-size:12px}.diagnostics{border-top:1px solid var(--line);padding:13px 20px}.diagnostic{font-size:10px;padding:6px 0;color:var(--muted)}.diagnostic.ok{color:var(--green)}.rows{border-top:1px solid var(--line)}.row{display:grid;grid-template-columns:minmax(90px,.42fr) minmax(0,1fr) auto;gap:9px;align-items:center;padding:11px 20px;border-bottom:1px solid var(--line);font-size:10px}.row:last-child{border-bottom:0}.row strong{font-family:var(--mono);font-size:9px}.row span{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row time{color:var(--muted);font:8px var(--mono)}.empty{padding:20px;color:var(--muted);font-size:10px}footer{text-align:center;color:var(--muted);font-size:9px;padding:25px 0 35px}.toast{position:fixed;right:18px;bottom:18px;max-width:min(360px,calc(100% - 36px));border:1px solid #2c6d58;border-radius:10px;background:#10251f;color:var(--green);padding:11px 14px;font-size:11px;box-shadow:0 18px 50px #000;z-index:999}.toast.error{color:var(--red);background:#2a1515;border-color:#6d3434}.login-body{min-height:100vh;display:grid;place-items:center;padding:20px}.login-card{width:min(390px,100%);border:1px solid var(--line);border-radius:16px;background:var(--panel);padding:28px}.login-card h1{margin:14px 0 8px}.login-card p,.login-card small{color:var(--muted);font-size:11px}.login-card label{display:block;font-size:10px;margin:18px 0 7px}.login-card input{color:var(--text)}.login-error{border:1px solid #6d3434;background:#2a1515;color:var(--red);border-radius:8px;padding:9px;font-size:10px;margin-top:14px}
.inline-error{border:1px solid #6d3434;border-radius:9px;background:#2a1515;color:var(--red);padding:9px 11px;font-size:10px;margin:8px 0}
.connection-card{order:1}.settings-card{order:2}.quick-note{display:grid;gap:5px;border:1px solid #276a54;border-radius:12px;background:#0c1d19;padding:14px;margin-bottom:14px}.quick-note strong{color:var(--green);font-size:12px}.quick-note span{color:var(--muted);font-size:10px;line-height:1.5}.advanced-panel,.permission-advanced{border:1px solid var(--line);border-radius:11px;overflow:hidden}.advanced-panel{margin-top:14px}.advanced-panel>summary,.permission-advanced>summary{cursor:pointer;list-style:none;padding:12px 14px;color:var(--muted);font-size:10px;font-weight:800;background:var(--panel2)}.advanced-panel>summary::-webkit-details-marker,.permission-advanced>summary::-webkit-details-marker{display:none}.advanced-panel>summary:after,.permission-advanced>summary:after{content:"＋";float:right;color:var(--green)}.advanced-panel[open]>summary:after,.permission-advanced[open]>summary:after{content:"−"}.advanced-panel[open]{padding:0 14px 14px}.advanced-panel[open]>summary{margin:0 -14px 10px}.permission-advanced{border:0;border-radius:0}.permission-advanced>summary{border-top:1px solid var(--line)}
.test-conn-btn{margin:10px 0 0;background:linear-gradient(180deg,#162432 0,#101a24 100%);border-color:#32465c;color:var(--blue);font-weight:800;transition:.15s}
.test-conn-btn:hover:not(:disabled){border-color:var(--blue);box-shadow:0 0 12px rgba(130,181,255,.15)}
.test-conn-panel{border:1px solid #2b4156;border-radius:12px;background:#0d151e;padding:12px;margin:12px 0 6px}
.test-panel-header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
.test-panel-header strong{font-size:11px;color:var(--text)}
.test-panel-header strong.good{color:var(--green)}
.test-panel-header strong.warn{color:var(--yellow)}
.test-panel-header strong.bad{color:var(--red)}
.test-panel-steps{display:flex;flex-direction:column;gap:6px}
.test-step{border:1px solid var(--line);border-radius:8px;background:var(--panel);padding:8px 10px;font-size:10px}
.test-step.ok{border-left:3px solid var(--green)}
.test-step.fail{border-left:3px solid var(--red)}
.test-step-head{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:3px}
.test-step-head strong{font-size:10px;color:var(--text)}
.test-step small{display:block;color:var(--muted);font-size:9px;line-height:1.4}
.latency-pill{font:800 8px var(--mono);color:var(--muted);border:1px solid var(--line);padding:2px 5px;border-radius:99px}
.test-step-loading{padding:10px;color:var(--muted);font-size:10px;text-align:center}

/* Provider selector tabs */
.provider-section{margin:14px 0 10px}
.section-label{display:block;font-size:10px;font-weight:800;color:var(--muted);margin-bottom:8px}
.provider-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.provider-tab{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:11px 9px;text-align:left;cursor:pointer;color:var(--muted);transition:.15s;display:flex;flex-direction:column;gap:3px}
.provider-tab strong{font-size:12px;color:var(--text)}
.provider-tab small{font-size:8.5px;color:var(--muted);line-height:1.3}
.provider-tab:hover{border-color:#3d5168;background:var(--panel2)}
.provider-tab.active{border-color:var(--green);background:#0c1d19;box-shadow:0 0 14px rgba(92,224,181,.12)}
.provider-tab.active strong{color:var(--green)}
.provider-tab .tab-badge{position:absolute;top:-7px;right:6px;background:var(--green);color:var(--green2);font:900 7.5px var(--sans);padding:1px 5px;border-radius:99px;letter-spacing:.02em}
.provider-inputs{border:1px solid var(--line);border-radius:11px;background:rgba(23,31,42,.6);padding:12px;margin:10px 0}
.tunnel-action-row{display:flex;gap:9px;margin:14px 0}
.tunnel-action-row button{flex:1}

/* Recent Workspaces */
.recent-section{margin:8px 0 12px}
.recent-title{display:block;font-size:9.5px;font-weight:800;color:var(--muted);margin-bottom:6px}
.recent-chips{display:flex;flex-wrap:wrap;gap:6px}
.recent-chip{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:5px 9px;font:750 9.5px var(--sans);color:var(--muted);cursor:pointer;transition:.15s;display:flex;align-items:center;gap:5px}
.recent-chip:hover{border-color:var(--green);color:var(--text);background:var(--panel2)}
.recent-chip.current{border-color:var(--green);color:var(--green);background:rgba(92,224,181,.08)}

/* Preset Tasks */
.preset-section{border-top:1px solid var(--line);padding:12px 20px 16px}
.preset-title{display:block;font-size:9.5px;font-weight:800;color:var(--muted);margin-bottom:8px}
.preset-chips{display:flex;flex-wrap:wrap;gap:6px}
.preset-chip{background:var(--panel2);border:1px solid #32465c;border-radius:8px;padding:6px 10px;font:800 9.5px var(--sans);color:var(--blue);cursor:pointer;transition:.15s;display:flex;align-items:center;gap:4px}
.preset-chip:hover{border-color:var(--blue);background:#16283d;color:#fff;box-shadow:0 0 10px rgba(130,181,255,.2)}
.preset-chip small{font-size:8px;color:var(--muted);margin-left:2px}

/* Diff Modal */
.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(5px);display:grid;place-items:center;padding:20px;z-index:1000}
.modal-backdrop[hidden]{display:none!important}
.modal-card{width:min(920px,100%);max-height:88vh;background:var(--panel);border:1px solid var(--line);border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.5);display:flex;flex-direction:column;overflow:hidden}
.modal-header{padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);background:var(--panel2)}
.modal-header h2{font-size:16px;margin:0}
.diff-content{padding:20px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:16px}
.modal-footer{padding:14px 20px;border-top:1px solid var(--line);background:var(--panel2);display:flex;justify-content:flex-end;gap:10px}
.diff-file-card{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--bg)}
.diff-file-head{padding:10px 14px;background:var(--panel2);border-bottom:1px solid var(--line);font:750 11px var(--mono);color:var(--text);display:flex;align-items:center;justify-content:space-between}
.diff-code-box{font:10px var(--mono);padding:10px 0;max-height:300px;overflow-y:auto}
.diff-line{padding:2px 14px;white-space:pre-wrap;display:flex;gap:10px;line-height:1.4}
.diff-line.add{background:rgba(92,224,181,.12);color:var(--green)}
.diff-line.del{background:rgba(255,139,139,.12);color:var(--red)}
.diff-line .prefix{width:12px;font-weight:900;user-select:none;flex-shrink:0}
.clickable-row{cursor:pointer;transition:.15s}
.clickable-row:hover{background:var(--panel2)}

@media(max-width:850px){.main-grid,.info-grid{grid-template-columns:1fr}.hero{padding-top:32px}.header-actions .status-pill{display:none}}
@media(max-width:560px){.page{width:min(100% - 20px,1120px)}.header{height:64px}.hero{padding:28px 2px 18px}.card{padding:15px}.compact .card-head{padding:15px 15px 0}.compact>p{padding:0 15px}.warning{margin:10px 15px 15px!important}.stats{padding:0 15px 15px}.row{padding:10px 15px}.input-action{flex-wrap:wrap}.input-action input{flex-basis:100%}.provider-tabs{grid-template-columns:1fr}.tunnel-action-row{flex-direction:column}.header-actions{gap:7px}}
`;

export const ADMIN_JS = `
const state={
  status:null,
  settings:null,
  tunnel:null,
  secret:null,
  tokenVisible:false,
  connectorPublicUrl:null,
  selectedProvider:'ngrok',
  workspaces:[],
  presets:[],
  checkpoints:[],
  activeDiffCheckpointId:null
};
const q=(selector)=>document.querySelector(selector);
const qa=(selector)=>document.querySelectorAll(selector);
const el=(tag,className,text)=>{const value=document.createElement(tag);if(className)value.className=className;if(text!==undefined)value.textContent=String(text);return value};
const actionHeaders={"X-Local-Coder-Admin":"1"};

async function api(url,options={}){
  const response=await fetch(url,{...options,headers:{...actionHeaders,...(options.headers||{})}});
  let data={};
  try{data=await response.json()}catch{}
  if(!response.ok)throw new Error(data.error||("HTTP "+response.status));
  return data;
}

function toast(message,error=false){
  const node=q("#toast");
  node.textContent=message;
  node.className="toast "+(error?"error":"");
  node.hidden=false;
  clearTimeout(node.timer);
  node.timer=setTimeout(()=>{node.hidden=true},3800);
}

async function copy(text,label){
  if(!text)throw new Error("Không có "+label+" để sao chép");
  if(navigator.clipboard&&window.isSecureContext){
    await navigator.clipboard.writeText(text);
  } else {
    const input=document.createElement("input");
    input.value=text;
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  toast("Đã sao chép "+label);
}

function formatUptime(seconds){
  if(seconds<60)return seconds+" giây";
  if(seconds<3600)return Math.floor(seconds/60)+" phút";
  return Math.floor(seconds/3600)+" giờ";
}

function selectProvider(provider){
  state.selectedProvider=provider;
  qa(".provider-tab").forEach(tab=>{
    tab.classList.toggle("active",tab.dataset.provider===provider);
  });
  q("#panel-ngrok").hidden = provider !== "ngrok";
  q("#panel-cloudflared").hidden = provider !== "cloudflared";
  q("#panel-pinggy").hidden = provider !== "pinggy";
}

function renderStatus(){
  const s=state.status;
  if(!s)return;
  q("#stats").replaceChildren(
    stat("Server","Online",true),
    stat("Uptime",formatUptime(s.uptimeSeconds)),
    stat("MCP sessions",s.sessions),
    stat("Chế độ",s.config.permissionMode==="workspace-write"?"Có thể sửa":"Chỉ đọc")
  );
}

function stat(label,value,good=false){
  const root=el("div","stat");
  root.append(el("small","",label),el("strong",good?"good":"",value));
  return root;
}

function renderSettings(){
  const s=state.settings;
  if(!s)return;
  q("#workspace-path").value=s.workspacePath||"";
  q("#allow-write").checked=s.permissionMode==="workspace-write";
  q("#allow-destructive").checked=Boolean(s.allowDestructive);
  q("#allow-remote-git").checked=Boolean(s.allowRemoteGit);
  q("#allow-shell").checked=Boolean(s.allowUnsafeShell);
  q("#allow-sensitive").checked=Boolean(s.allowSensitiveFiles);
  q("#auto-start-tunnel").checked=Boolean(s.autoStartTunnel);
  q("#pick-folder").disabled=!s.folderPickerSupported;
  
  if(s.cloudflareTunnelToken && !q("#cf-tunnel-token").matches(":focus"))q("#cf-tunnel-token").value=s.cloudflareTunnelToken;
  if(s.ngrokDomain && !q("#ngrok-domain").matches(":focus"))q("#ngrok-domain").value=s.ngrokDomain;
  if(s.ngrokAuthToken && !q("#ngrok-token").matches(":focus"))q("#ngrok-token").value=s.ngrokAuthToken;
  
  if(s.tunnelProvider && !state.tunnel?.provider){
    selectProvider(s.tunnelProvider);
  }
  syncPermissionControls();
}

function syncPermissionControls(){
  const enabled=q("#allow-write").checked;
  for(const id of ["#allow-destructive","#allow-remote-git","#allow-shell","#allow-sensitive"]){
    const input=q(id);
    input.disabled=!enabled;
    if(!enabled)input.checked=false;
  }
}

function renderTunnel(){
  const t=state.tunnel||{state:"stopped"};
  const badge=q("#tunnel-badge");
  const labels={stopped:"Chưa chạy",starting:"Đang lấy URL…",running:"Đã kết nối",stopping:"Đang dừng…",failed:"Có lỗi"};
  
  if(t.provider){
    selectProvider(t.provider);
  }
  
  badge.textContent=labels[t.state]||t.state;
  badge.className="status-pill "+(t.state==="running"?"good":t.state==="failed"?"bad":t.state==="starting"||t.state==="stopping"?"warn":"");
  
  const isBusy = t.state==="starting"||t.state==="stopping";
  const isRunning = t.state==="running";
  
  q("#start-tunnel").disabled = isBusy || isRunning;
  q("#stop-tunnel").disabled = t.state==="stopped" || isBusy;
  
  if(isBusy){
    q("#start-tunnel").textContent = "⏳ Đang kết nối…";
  } else if(isRunning){
    q("#start-tunnel").textContent = "● Đang hoạt động";
  } else {
    q("#start-tunnel").textContent = "▶ Bắt đầu kết nối";
  }
  
  q("#pinggy-url").value=t.publicUrl||"";
  q("#copy-pinggy").disabled=!t.publicUrl;
  
  const error=q("#tunnel-error");
  error.hidden=!t.error;
  error.textContent=t.error||"";
  
  const pName = state.selectedProvider === "ngrok" ? "Ngrok" : state.selectedProvider === "cloudflared" ? "Cloudflare" : "Pinggy";
  const messages={
    stopped: "Vui lòng bấm 'Bắt đầu kết nối' để tạo URL cho ChatGPT",
    starting: "Đang mở " + pName + " tunnel và tạo URL, vui lòng chờ vài giây…",
    running: "✓ URL đã sẵn sàng — bấm Sao chép và dán vào ChatGPT",
    stopping: "Đang dừng kết nối tunnel…",
    failed: "Không mở được tunnel — hãy kiểm tra lại cấu hình hoặc token"
  };
  q("#connection-message").textContent=messages[t.state]||"Đang kiểm tra kết nối…";
  
  if(state.connectorPublicUrl && state.connectorPublicUrl!==t.publicUrl){
    state.secret=null;
    state.connectorPublicUrl=null;
  }
  renderSecrets();
}

function renderSecrets(){
  const secret=state.secret;
  q("#mcp-token").type=state.tokenVisible?"text":"password";
  q("#mcp-token").value=secret&&state.tokenVisible?secret.mcpToken:"••••••••••••••••••••••••";
  q("#reveal-token").textContent=state.tokenVisible?"Ẩn":"Hiện";
  
  const connector=secret&&secret.connectorUrl?secret.connectorUrl:"";
  q("#connector-url").value=connector;
  q("#copy-connector").disabled=!connector;
  
  const hint=q("#connector-hint");
  hint.textContent=connector
    ? "✓ URL hợp lệ chứa token bảo mật. Dán link này vào ChatGPT → Settings → Apps."
    : (state.tunnel&&state.tunnel.publicUrl&&state.settings&&!state.settings.allowUrlToken)
      ? "URL token đang tắt. Hãy bật ALLOW_URL_TOKEN hoặc dùng Secure MCP Tunnel."
      : "Bấm 'Bắt đầu kết nối' để tạo URL.";
}

function renderRecentWorkspaces(){
  const list = state.workspaces || [];
  const container = q("#recent-list");
  if(!list.length){
    q("#recent-workspaces-section").hidden = true;
    return;
  }
  q("#recent-workspaces-section").hidden = false;
  container.replaceChildren(...list.map(item=>{
    const chip = el("button", "recent-chip" + (item.isCurrent ? " current" : ""));
    chip.type = "button";
    chip.append(el("span", "", "📁 " + item.name));
    chip.addEventListener("click", async()=>{
      try {
        await api("/api/workspaces/select", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({ path: item.path })
        });
        toast("Đã chuyển sang dự án: " + item.name);
        await load();
      } catch(e) {
        toast(e.message, true);
      }
    });
    return chip;
  }));
}

function renderPresetTasks(){
  const presets = state.presets || [];
  const container = q("#preset-list");
  if(!presets.length){
    q("#preset-tasks-section").hidden = true;
    return;
  }
  q("#preset-tasks-section").hidden = false;
  container.replaceChildren(...presets.map(p=>{
    const chip = el("button", "preset-chip");
    chip.type = "button";
    chip.append(el("span", "", "+ " + p.name), el("small", "", p.description));
    chip.addEventListener("click", async()=>{
      try {
        await api("/api/tasks/enable-preset", {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify(p)
        });
        toast("Đã bật task: " + p.name);
        await load();
      } catch(e) {
        toast(e.message, true);
      }
    });
    return chip;
  }));
}

function renderRows(){
  const tasks=state.tasks||[];
  q("#task-count").textContent=String(tasks.length);
  q("#tasks").replaceChildren(...(tasks.length?tasks.map(task=>{
    const row=el("div","row");
    row.append(el("strong","",task.name),el("span","",task.description),el("time","","được phép"));
    return row;
  }):[el("div","empty","Chưa có task trong .local-coder/tasks.json")]));
  
  const checkpoints = state.checkpoints || [];
  q("#checkpoint-count").textContent = String(checkpoints.length) + " checkpoint";
  
  const events=state.events||[];
  q("#activity").replaceChildren(...(events.length?events.slice(0,8).map(event=>{
    const row=el("div","row clickable-row");
    row.append(
      el("strong","",event.tool),
      el("span","",event.action+" · "+event.outcome + (event.target ? " ("+event.target+")" : "")),
      el("time","",new Date(event.timestamp).toLocaleTimeString("vi-VN"))
    );
    row.addEventListener("click", () => {
      // Find matching checkpoint if any
      if(checkpoints.length) openDiffModal(checkpoints[0].id);
    });
    return row;
  }):[el("div","empty","Chưa có tool call")]));
}

async function openDiffModal(checkpointId){
  state.activeDiffCheckpointId = checkpointId;
  const modal = q("#diff-modal");
  const body = q("#diff-modal-body");
  const title = q("#diff-modal-title");
  
  modal.hidden = false;
  title.textContent = "Đang tải checkpoint " + checkpointId + "…";
  body.replaceChildren(el("div", "test-step-loading", "Đang tải dữ liệu so sánh thay đổi code…"));
  
  try {
    const data = await api("/api/checkpoints/" + checkpointId + "/diff");
    title.textContent = "Checkpoint: " + data.action + " (" + new Date(data.createdAt).toLocaleTimeString("vi-VN") + ")";
    
    if(!data.files || !data.files.length){
      body.replaceChildren(el("div", "empty", "Không có file nào bị ảnh hưởng"));
      return;
    }
    
    body.replaceChildren(...data.files.map(f=>{
      const card = el("div", "diff-file-card");
      const head = el("div", "diff-file-head");
      head.append(el("span", "", "📄 " + f.label), el("small", "", f.existsNow ? "Đã sửa" : "Đã xóa"));
      
      const box = el("div", "diff-code-box");
      const beforeLines = (f.beforeContent || "").split("\\n");
      const currentLines = (f.currentContent || "").split("\\n");
      
      // Simple visual line diff
      beforeLines.slice(0, 15).forEach(line => {
        if(!line) return;
        const row = el("div", "diff-line del");
        row.append(el("span", "prefix", "-"), el("span", "", line));
        box.append(row);
      });
      currentLines.slice(0, 15).forEach(line => {
        if(!line) return;
        const row = el("div", "diff-line add");
        row.append(el("span", "prefix", "+"), el("span", "", line));
        box.append(row);
      });
      
      card.append(head, box);
      return card;
    }));
  } catch(e) {
    body.replaceChildren(el("div", "test-step fail", e.message));
  }
}

q("#close-diff-modal").addEventListener("click", () => {
  q("#diff-modal").hidden = true;
});

q("#restore-checkpoint-btn").addEventListener("click", async() => {
  if(!state.activeDiffCheckpointId) return;
  if(!confirm("Bạn có chắc chắn muốn hoàn tác toàn bộ file về trạng thái trước checkpoint này không?")) return;
  try {
    await api("/api/checkpoints/" + state.activeDiffCheckpointId + "/restore", { method: "POST" });
    toast("✓ Đã hoàn tác thành công checkpoint!");
    q("#diff-modal").hidden = true;
    await load();
  } catch(e) {
    toast("Lỗi hoàn tác: " + e.message, true);
  }
});

async function ensureSecret(force=false){
  if(!state.secret||force){
    state.secret=await api("/api/secret",{method:"POST"});
  }
  return state.secret;
}

async function syncConnectorUrl(){
  const publicUrl=state.tunnel&&state.tunnel.publicUrl;
  if(!publicUrl){
    state.secret=null;
    state.connectorPublicUrl=null;
    renderSecrets();
    return;
  }
  if(state.connectorPublicUrl===publicUrl)return;
  try{
    state.secret=await ensureSecret(true);
    state.connectorPublicUrl=publicUrl;
    renderSecrets();
  }catch(error){
    toast("Không tải được URL: "+error.message,true);
  }
}

async function load(){
  try{
    const values=await Promise.all([
      api("/api/status"),
      api("/api/settings"),
      api("/api/tunnel"),
      api("/api/tasks"),
      api("/api/audit"),
      api("/api/checkpoints"),
      api("/api/workspaces/recent").catch(()=>({workspaces:[]})),
      api("/api/tasks/presets").catch(()=>({presets:[]}))
    ]);
    state.status=values[0];
    state.settings=values[1];
    state.tunnel=values[2];
    state.tasks=values[3].tasks;
    state.events=values[4].events;
    state.checkpoints=values[5].checkpoints;
    state.workspaces=values[6].workspaces || [];
    state.presets=values[7].presets || [];
    
    renderStatus();
    renderSettings();
    renderTunnel();
    renderRecentWorkspaces();
    renderPresetTasks();
    renderRows();
    await syncConnectorUrl();
  }catch(error){
    toast(error.message,true);
  }
}

// Tab clicks
qa(".provider-tab").forEach(tab=>{
  tab.addEventListener("click",()=>{
    if(state.tunnel && (state.tunnel.state==="starting" || state.tunnel.state==="running")){
      toast("Hãy bấm Dừng kết nối trước khi đổi nhà cung cấp",true);
      return;
    }
    selectProvider(tab.dataset.provider);
  });
});

q("#refresh").addEventListener("click",load);
q("#allow-write").addEventListener("change",syncPermissionControls);

q("#start-tunnel").addEventListener("click",async()=>{
  const provider=state.selectedProvider;
  const cfToken=q("#cf-tunnel-token").value.trim();
  const ngrokDomain=q("#ngrok-domain").value.trim();
  const ngrokToken=q("#ngrok-token").value.trim();
  const autoStart=q("#auto-start-tunnel").checked;
  const label=provider==="ngrok"?"Ngrok":provider==="cloudflared"?"Cloudflare":"Pinggy";
  
  try{
    // Auto-save settings first
    await api("/api/settings",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        workspacePath:q("#workspace-path").value,
        permissionMode:q("#allow-write").checked?"workspace-write":"read-only",
        allowDestructive:q("#allow-destructive").checked,
        allowRemoteGit:q("#allow-remote-git").checked,
        allowUnsafeShell:q("#allow-shell").checked,
        allowSensitiveFiles:q("#allow-sensitive").checked,
        autoStartTunnel:autoStart,
        tunnelProvider:provider,
        cloudflareTunnelToken:cfToken,
        ngrokDomain:ngrokDomain,
        ngrokAuthToken:ngrokToken
      })
    });
    
    state.secret=null;
    state.connectorPublicUrl=null;
    state.tunnel=await api("/api/tunnel/start",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        provider,
        cloudflareToken:cfToken,
        ngrokDomain:ngrokDomain,
        ngrokToken:ngrokToken,
        persistentDomain:ngrokDomain
      })
    });
    renderTunnel();
    toast("Đang mở "+label+", đang lấy URL…");
  }catch(error){
    toast(error.message,true);
  }
});

q("#stop-tunnel").addEventListener("click",async()=>{
  try{
    state.tunnel=await api("/api/tunnel/stop",{method:"POST"});
    state.secret=null;
    state.connectorPublicUrl=null;
    renderTunnel();
    toast("Đã dừng tunnel");
  }catch(error){
    toast(error.message,true);
  }
});

q("#copy-pinggy").addEventListener("click",()=>copy(state.tunnel&&state.tunnel.publicUrl,"URL public").catch(error=>toast(error.message,true)));

q("#reveal-token").addEventListener("click",async()=>{
  try{
    await ensureSecret();
    state.tokenVisible=!state.tokenVisible;
    renderSecrets();
  }catch(error){
    toast(error.message,true);
  }
});

q("#copy-token").addEventListener("click",async()=>{
  try{
    const secret=await ensureSecret();
    await copy(secret.mcpToken,"MCP_TOKEN");
  }catch(error){
    toast(error.message,true);
  }
});

q("#copy-connector").addEventListener("click",async()=>{
  const btn=q("#copy-connector");
  try{
    const secret=await ensureSecret(true);
    if(!secret.connectorUrl)throw new Error("Chưa có URL. Hãy bấm 'Bắt đầu kết nối' trước.");
    await copy(secret.connectorUrl,"URL connector");
    btn.textContent="✓ Đã chép!";
    setTimeout(()=>btn.textContent="Sao chép URL",2000);
  }catch(error){
    toast(error.message,true);
  }
});

q("#pick-folder").addEventListener("click",async()=>{
  const button=q("#pick-folder");
  button.disabled=true;
  button.textContent="Đang chờ…";
  toast("Đang mở hộp chọn thư mục trên máy tính…");
  try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),40000);
    const result=await api("/api/folder-picker",{method:"POST",signal:controller.signal});
    clearTimeout(timeout);
    if(result && result.selected){
      q("#workspace-path").value=result.selected;
      q("#save-state").textContent="Chưa lưu";
      toast("Đã chọn: "+result.selected);
    }else{
      toast("Bạn chưa chọn thư mục");
    }
  }catch(error){
    toast("Không mở được hộp chọn hoặc đã hết thời gian. Bạn có thể dán đường dẫn trực tiếp vào ô.",true);
  }finally{
    button.disabled=false;
    button.textContent="📁 Chọn thư mục";
  }
});

q("#workspace-path").addEventListener("input",()=>q("#save-state").textContent="Chưa lưu");
for(const id of ["#allow-write","#allow-destructive","#allow-remote-git","#allow-shell","#allow-sensitive","#auto-start-tunnel"])q(id).addEventListener("change",()=>q("#save-state").textContent="Chưa lưu");

q("#save-settings").addEventListener("click",async()=>{
  const button=q("#save-settings");
  button.disabled=true;
  try{
    const body={
      workspacePath:q("#workspace-path").value,
      permissionMode:q("#allow-write").checked?"workspace-write":"read-only",
      allowDestructive:q("#allow-destructive").checked,
      allowRemoteGit:q("#allow-remote-git").checked,
      allowUnsafeShell:q("#allow-shell").checked,
      allowSensitiveFiles:q("#allow-sensitive").checked,
      autoStartTunnel:q("#auto-start-tunnel").checked,
      tunnelProvider:state.selectedProvider,
      cloudflareTunnelToken:q("#cf-tunnel-token").value.trim(),
      ngrokDomain:q("#ngrok-domain").value.trim(),
      ngrokAuthToken:q("#ngrok-token").value.trim()
    };
    const result=await api("/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    state.settings=result.settings;
    q("#save-state").textContent="Đã lưu";
    await load();
    toast("Đã lưu cài đặt!");
  }catch(error){
    toast(error.message,true);
  }finally{
    button.disabled=false;
  }
});

q("#diagnostics").addEventListener("click",async()=>{
  const button=q("#diagnostics");
  button.disabled=true;
  try{
    const result=await api("/api/diagnostics",{method:"POST"});
    const box=q("#diagnostic-results");
    box.hidden=false;
    box.replaceChildren(...result.checks.map(check=>el("div","diagnostic "+(check.ok?"ok":""),(check.ok?"✓ ":"! ")+check.name+" — "+check.detail)));
    toast(result.ok?"Kiểm tra hoàn tất":"Có mục cần chú ý",!result.ok);
  }catch(error){
    toast(error.message,true);
  }finally{
    button.disabled=false;
  }
});

q("#test-connection").addEventListener("click",async()=>{
  const button=q("#test-connection");
  const panel=q("#test-connection-panel");
  const summary=q("#test-panel-summary");
  const stepsBox=q("#test-panel-steps");
  
  button.disabled=true;
  button.textContent="⏳ Đang kiểm tra Máy local ↔ ChatGPT…";
  panel.hidden=false;
  summary.textContent="Đang kiểm tra kết nối…";
  summary.className="";
  stepsBox.replaceChildren(el("div","test-step-loading","Đang kiểm tra Local Server, Public Tunnel và MCP Handshake…"));
  
  try{
    const res=await api("/api/test-connection",{method:"POST"});
    summary.textContent=(res.ok?"✓ ":"! ")+res.summary;
    summary.className=res.ok?"good":"warn";
    const steps=[res.steps.localServer,res.steps.tunnel,res.steps.protocol,res.steps.chatgpt];
    stepsBox.replaceChildren(...steps.map(s=>{
      const row=el("div","test-step "+(s.ok?"ok":"fail"));
      const top=el("div","test-step-head");
      top.append(el("strong","",(s.ok?"✓ ":"✕ ")+s.name));
      if(s.latencyMs!==undefined)top.append(el("span","latency-pill",s.latencyMs+"ms"));
      row.append(top,el("small","",s.detail));
      return row;
    }));
    toast(res.ok?"Kết nối Máy local ↔ ChatGPT hoạt động":"Kiểm tra xong: có mục cần chú ý",!res.ok);
  }catch(error){
    summary.textContent="✕ Lỗi kiểm tra kết nối";
    summary.className="bad";
    stepsBox.replaceChildren(el("div","test-step fail",error.message));
    toast(error.message,true);
  }finally{
    button.disabled=false;
    button.textContent="⚡ Kiểm tra kết nối Máy local ↔ ChatGPT";
  }
});

q("#close-test-panel").addEventListener("click",()=>{
  q("#test-connection-panel").hidden=true;
});

// SSE Realtime connection
try {
  const events = new EventSource("/api/events");
  events.onmessage = (e) => {
    try {
      const ev = JSON.parse(e.data);
      if(ev && ev.tool){
        toast("⚡ ChatGPT vừa gọi tool: " + ev.tool + " (" + ev.action + ")");
        load();
      }
    } catch {}
  };
} catch {}

setInterval(async()=>{
  if(!state.tunnel)return;
  try{
    state.tunnel=await api("/api/tunnel");
    renderTunnel();
    await syncConnectorUrl();
  }catch{}
},2000);

load();
`;
