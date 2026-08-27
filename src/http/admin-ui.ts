export const ADMIN_HTML = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>Local Coder</title>
  <link rel="stylesheet" href="/assets/admin.css">
</head>
<body>
  <main class="page">
    <header class="header">
      <div class="brand"><span class="logo">LS</span><div><strong>Local Secure</strong><small>MCP · macOS / Windows / Linux</small></div></div>
      <div class="header-actions"><span id="server-state" class="status-pill good">● Server đang chạy</span><button id="refresh" class="button ghost">Làm mới</button><form method="post" action="/logout"><button class="link-button" type="submit">Đăng xuất</button></form></div>
    </header>

    <section class="hero">
      <p class="eyebrow">LOCAL-FIRST · LEAST PRIVILEGE</p>
      <h1>Kết nối ChatGPT với code trên máy</h1>
      <p>Chọn project, cấp đúng quyền cần dùng, rồi kết nối bằng OpenAI Secure MCP Tunnel.</p>
    </section>

    <section class="main-grid">
      <article class="card connection-card">
        <div class="card-head">
          <div><span class="step">TÙY CHỌN LEGACY</span><h2>Public HTTPS tunnel</h2></div>
          <span id="tunnel-badge" class="status-pill">Chưa chạy</span>
        </div>
        <p class="muted">Ưu tiên Secure MCP Tunnel trong docs/secure-tunnel.md. Public URL dưới đây chỉ dành cho thử nghiệm; URL connector cần ALLOW_URL_TOKEN=true.</p>
        <div class="button-row tunnel-controls">
          <select id="tunnel-provider" aria-label="Nhà cung cấp tunnel"><option value="cloudflared" selected>Cloudflare · khuyên dùng</option><option value="pinggy">Pinggy · dự phòng</option></select>
          <button id="start-tunnel" class="button primary">▶ Mở tunnel</button>
          <button id="stop-tunnel" class="button danger" disabled>■ Dừng tunnel</button>
        </div>
        <p id="tunnel-error" class="inline-error" hidden></p>
        <label class="field">
          <span>URL public</span>
          <div class="input-action"><input id="pinggy-url" readonly placeholder="Bấm Mở tunnel để lấy URL"><button id="copy-pinggy" class="button ghost" disabled>Sao chép</button></div>
        </label>
        <label class="field">
          <span>MCP_TOKEN</span>
          <div class="input-action"><input id="mcp-token" type="password" readonly value="••••••••••••••••••••••••"><button id="reveal-token" class="button ghost">Hiện</button><button id="copy-token" class="button ghost">Sao chép</button></div>
        </label>
        <label class="field featured">
          <span>URL dán vào ChatGPT</span>
          <div class="input-action"><input id="connector-url" type="password" readonly placeholder="URL sẽ có sau khi tunnel sẵn sàng"><button id="reveal-connector" class="button ghost">Hiện</button><button id="copy-connector" class="button primary" disabled>Sao chép URL</button></div>
        </label>
        <button id="test-connection" class="button ghost wide test-conn-btn">⚡ Kiểm tra kết nối ChatGPT ↔ Máy tính</button>
        <div id="test-connection-panel" class="test-conn-panel" hidden>
          <div class="test-panel-header">
            <strong id="test-panel-summary">Đang kiểm tra kết nối…</strong>
            <button id="close-test-panel" class="link-button" type="button">Đóng</button>
          </div>
          <div id="test-panel-steps" class="test-panel-steps"></div>
        </div>
        <div class="mini-steps">
          <span><b>1</b> Chọn project</span><span><b>2</b> Chạy Secure Tunnel</span><span><b>3</b> Chọn tunnel_id trong ChatGPT</span>
        </div>
      </article>

      <article class="card settings-card">
        <div class="card-head"><div><span class="step">BƯỚC 2</span><h2>Project và quyền</h2></div><span id="save-state" class="saved">Đã lưu</span></div>
        <label class="field">
          <span>Thư mục project ChatGPT được truy cập</span>
          <div class="input-action"><input id="workspace-path" autocomplete="off" spellcheck="false"><button id="pick-folder" class="button ghost">📁 Chọn thư mục</button></div>
          <small>Không thể chọn toàn bộ ổ đĩa hoặc thư mục Home.</small>
        </label>
        <div class="permissions">
          <label class="toggle-row"><span><strong>Đọc code</strong><small>Luôn bật trong workspace đã chọn</small></span><input type="checkbox" checked disabled><i></i></label>
          <label class="toggle-row"><span><strong>Tự sửa code + chạy task + Git local</strong><small>Cho phép tạo/sửa file và chạy task trong allowlist</small></span><input id="allow-write" type="checkbox"><i></i></label>
          <label class="toggle-row risky"><span><strong>Xóa file và khôi phục checkpoint</strong><small>Có thể thay đổi hoặc loại bỏ dữ liệu</small></span><input id="allow-destructive" type="checkbox"><i></i></label>
          <label class="toggle-row risky"><span><strong>Git pull / push</strong><small>Có thể gửi code ra remote</small></span><input id="allow-remote-git" type="checkbox"><i></i></label>
          <label class="toggle-row risky"><span><strong>Shell tùy ý</strong><small>Quyền rất cao; chỉ bật với project bạn tin tưởng</small></span><input id="allow-shell" type="checkbox"><i></i></label>
          <label class="toggle-row risky"><span><strong>Đọc file nhạy cảm</strong><small>Bao gồm .env và credential trong workspace</small></span><input id="allow-sensitive" type="checkbox"><i></i></label>
        </div>
        <button id="save-settings" class="button primary wide">Lưu và áp dụng ngay</button>
        <p class="notice">Sau khi đổi quyền hoặc project: Refresh plugin và mở chat mới để ChatGPT nhận đúng danh sách tool.</p>
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
      </article>
      <article class="card compact">
        <div class="card-head"><div><span class="step">AUDIT</span><h2>Tool call gần đây</h2></div><span id="checkpoint-count" class="count">0 checkpoint</span></div>
        <div id="activity" class="rows"></div>
      </article>
    </section>

    <footer>🔒 Token chỉ hiện sau khi bạn bấm · Không tunnel cổng Admin · Không lưu secret trong trình duyệt</footer>
  </main>
  <div id="toast" class="toast" role="status" hidden></div>
  <script src="/assets/admin.js" defer></script>
</body>
</html>`;

export function adminLoginHtml(invalid = false): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>Đăng nhập · Local Coder</title><link rel="stylesheet" href="/assets/admin.css"></head><body class="login-body"><main class="login-card"><span class="logo">LC</span><p class="eyebrow">LOCALHOST ADMIN</p><h1>Local Coder</h1><p>Nhập <code>ADMIN_TOKEN</code> trong file <code>.env</code>.</p>${invalid ? '<div class="login-error" role="alert">Token không đúng. Hãy kiểm tra lại ADMIN_TOKEN.</div>' : ''}<form method="post" action="/login"><label for="admin-token">Admin token</label><input id="admin-token" name="token" type="password" minlength="32" required autofocus autocomplete="current-password"><button class="button primary wide" type="submit">Mở dashboard</button></form><small>Dashboard chỉ chạy trên máy local.</small></main></body></html>`;
}

export const ADMIN_STYLESHEET = `
:root{color-scheme:dark;--bg:#0a0d12;--panel:#111720;--panel2:#171f2a;--line:#293442;--text:#f4f7f9;--muted:#91a0ad;--green:#5ce0b5;--green2:#0a3328;--blue:#82b5ff;--yellow:#f6c66f;--red:#ff8b8b;--sans:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--mono:"SFMono-Regular",Consolas,monospace}
*{box-sizing:border-box}html{background:var(--bg)}body{margin:0;min-width:320px;background:radial-gradient(circle at 50% -20%,#172431 0,transparent 42%),var(--bg);color:var(--text);font-family:var(--sans);-webkit-font-smoothing:antialiased}.page{width:min(1120px,calc(100% - 32px));margin:0 auto}.header{height:72px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line)}.brand,.header-actions{display:flex;align-items:center;gap:11px}.brand strong,.brand small{display:block}.brand strong{font-size:14px}.brand small{font-size:10px;color:var(--muted);margin-top:2px}.logo{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:var(--green);color:var(--green2);font-size:12px;font-weight:900}.hero{padding:42px 0 24px}.hero h1{font-size:clamp(30px,5vw,48px);line-height:1.03;letter-spacing:-.05em;margin:0 0 12px}.hero>p:last-child{color:var(--muted);font-size:14px;margin:0}.eyebrow,.step{display:block;color:var(--green);font-size:9px;font-weight:900;letter-spacing:.16em;margin:0 0 8px}.main-grid{display:grid;grid-template-columns:1.08fr .92fr;gap:14px}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}.card{border:1px solid var(--line);border-radius:16px;background:rgba(17,23,32,.96);padding:20px;box-shadow:0 18px 50px rgba(0,0,0,.15)}.card.compact{padding:0}.card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}.compact .card-head{padding:20px 20px 0}.card h2{font-size:17px;letter-spacing:-.025em;margin:0}.muted,.notice,.compact>p{color:var(--muted);font-size:11px;line-height:1.6}.button,.link-button{font:750 11px var(--sans);cursor:pointer}.button{border:1px solid var(--line);border-radius:9px;padding:10px 13px;background:var(--panel2);color:var(--text)}.button.primary{background:var(--green);border-color:var(--green);color:var(--green2)}.button.ghost{background:var(--panel2)}.button.danger{color:var(--red)}.button.wide{width:100%;margin-top:15px}.button:disabled{opacity:.42;cursor:not-allowed}.link-button{border:0;background:transparent;color:var(--muted);padding:8px 0}.button-row{display:flex;gap:8px;margin:18px 0}.status-pill,.saved,.count{border:1px solid var(--line);border-radius:99px;padding:5px 8px;color:var(--muted);font:800 9px var(--sans)}.status-pill.good{color:var(--green);border-color:#276a54}.status-pill.warn{color:var(--yellow);border-color:#66532f}.status-pill.bad{color:var(--red);border-color:#673939}.saved{color:var(--green);border:0}.field{display:block;margin:14px 0}.field>span{display:block;color:var(--muted);font-size:10px;font-weight:750;margin-bottom:7px}.field>small{display:block;color:var(--muted);font-size:9px;margin-top:6px}.input-action{display:flex;gap:7px}.input-action input{min-width:0;flex:1}.field.featured{border:1px solid #2b6a57;border-radius:12px;background:#0c1d19;padding:12px}.field.featured>span{color:var(--green)}input{width:100%;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--blue);padding:11px 12px;font:10px var(--mono);outline:none}input:focus{border-color:var(--green)}.mini-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:16px}.mini-steps span{border:1px solid var(--line);border-radius:9px;padding:10px;color:var(--muted);font-size:9px;line-height:1.4}.mini-steps b{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:var(--panel2);color:var(--green);margin-right:3px}.permissions{border:1px solid var(--line);border-radius:11px;overflow:hidden}.toggle-row{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;background:var(--panel);border-bottom:1px solid var(--line);cursor:pointer}.toggle-row:last-child{border-bottom:0}.toggle-row.risky{background:#171614}.toggle-row span{min-width:0}.toggle-row strong,.toggle-row small{display:block}.toggle-row strong{font-size:11px}.toggle-row small{color:var(--muted);font-size:9px;margin-top:3px}.toggle-row input{position:absolute;opacity:0;pointer-events:none}.toggle-row i{width:36px;height:20px;border-radius:99px;background:#303a45;position:relative;flex:0 0 auto}.toggle-row i:after{content:"";position:absolute;width:14px;height:14px;left:3px;top:3px;border-radius:50%;background:#9ba7b1;transition:.15s}.toggle-row input:checked+i{background:#286f58}.toggle-row input:checked+i:after{left:19px;background:var(--green)}.toggle-row input:disabled+i{opacity:.6}.notice{border:1px solid #45536a;background:#121a27;border-radius:9px;padding:10px;margin:12px 0 0}.warning{border:1px solid #5b4927;background:#201b12;border-radius:9px;padding:10px!important;margin:10px 20px 20px!important;color:var(--yellow)!important}.compact>p{padding:0 20px;margin:0 0 13px}.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:0 20px 20px}.stat{border:1px solid var(--line);border-radius:10px;background:var(--panel2);padding:11px}.stat small,.stat strong{display:block}.stat small{font-size:8px;color:var(--muted);margin-bottom:5px}.stat strong{font-size:12px}.diagnostics{border-top:1px solid var(--line);padding:13px 20px}.diagnostic{font-size:10px;padding:6px 0;color:var(--muted)}.diagnostic.ok{color:var(--green)}.rows{border-top:1px solid var(--line)}.row{display:grid;grid-template-columns:minmax(90px,.42fr) minmax(0,1fr) auto;gap:9px;align-items:center;padding:11px 20px;border-bottom:1px solid var(--line);font-size:10px}.row:last-child{border-bottom:0}.row strong{font-family:var(--mono);font-size:9px}.row span{color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.row time{color:var(--muted);font:8px var(--mono)}.empty{padding:20px;color:var(--muted);font-size:10px}footer{text-align:center;color:var(--muted);font-size:9px;padding:25px 0 35px}.toast{position:fixed;right:18px;bottom:18px;max-width:min(360px,calc(100% - 36px));border:1px solid #2c6d58;border-radius:10px;background:#10251f;color:var(--green);padding:11px 14px;font-size:11px;box-shadow:0 18px 50px #000}.toast.error{color:var(--red);background:#2a1515;border-color:#6d3434}.login-body{min-height:100vh;display:grid;place-items:center;padding:20px}.login-card{width:min(390px,100%);border:1px solid var(--line);border-radius:16px;background:var(--panel);padding:28px}.login-card h1{margin:14px 0 8px}.login-card p,.login-card small{color:var(--muted);font-size:11px}.login-card label{display:block;font-size:10px;margin:18px 0 7px}.login-card input{color:var(--text)}.login-error{border:1px solid #6d3434;background:#2a1515;color:var(--red);border-radius:8px;padding:9px;font-size:10px;margin-top:14px}
.tunnel-controls select{min-width:0;flex:1;border:1px solid var(--line);border-radius:9px;background:var(--bg);color:var(--text);padding:9px 10px;font:700 10px var(--sans)}
.inline-error{border:1px solid #6d3434;border-radius:9px;background:#2a1515;color:var(--red);padding:9px 11px;font-size:10px}
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
@media(max-width:850px){.main-grid,.info-grid{grid-template-columns:1fr}.hero{padding-top:32px}.header-actions .status-pill{display:none}}
@media(max-width:560px){.page{width:min(100% - 20px,1120px)}.header{height:64px}.hero{padding:28px 2px 18px}.card{padding:15px}.compact .card-head{padding:15px 15px 0}.compact>p{padding:0 15px}.warning{margin:10px 15px 15px!important}.stats{padding:0 15px 15px}.row{padding:10px 15px}.input-action{flex-wrap:wrap}.input-action input{flex-basis:100%}.mini-steps{grid-template-columns:1fr}.button-row .button{flex:1}.header-actions{gap:7px}}
`;

export const ADMIN_JS = `
const state={status:null,settings:null,tunnel:null,secret:null,tokenVisible:false,connectorVisible:false};
const q=(selector)=>document.querySelector(selector);
const el=(tag,className,text)=>{const value=document.createElement(tag);if(className)value.className=className;if(text!==undefined)value.textContent=String(text);return value};
const actionHeaders={"X-Local-Coder-Admin":"1"};
async function api(url,options={}){const response=await fetch(url,{...options,headers:{...actionHeaders,...(options.headers||{})}});let data={};try{data=await response.json()}catch{}if(!response.ok)throw new Error(data.error||("HTTP "+response.status));return data}
function toast(message,error=false){const target=q("#toast");target.textContent=message;target.className="toast"+(error?" error":"");target.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>target.hidden=true,3200)}
async function copy(value,label){if(!value)throw new Error("Chưa có dữ liệu để sao chép");try{await navigator.clipboard.writeText(value)}catch{const t=document.createElement("textarea");t.value=value;t.style.position="fixed";t.style.opacity="0";document.body.appendChild(t);t.focus();t.select();document.execCommand("copy");document.body.removeChild(t)}toast("Đã sao chép "+label)}
function formatUptime(seconds){if(seconds<60)return seconds+" giây";if(seconds<3600)return Math.floor(seconds/60)+" phút";return Math.floor(seconds/3600)+" giờ"}
function renderStatus(){const s=state.status;if(!s)return;q("#stats").replaceChildren(stat("Server","Online",true),stat("Uptime",formatUptime(s.uptimeSeconds)),stat("MCP sessions",s.sessions),stat("Chế độ",s.config.permissionMode==="workspace-write"?"Có thể sửa":"Chỉ đọc"))}
function stat(label,value,good=false){const root=el("div","stat");root.append(el("small","",label),el("strong",good?"good":"",value));return root}
function renderSettings(){const s=state.settings;if(!s)return;q("#workspace-path").value=s.workspacePath;q("#allow-write").checked=s.permissionMode==="workspace-write";q("#allow-destructive").checked=s.allowDestructive;q("#allow-remote-git").checked=s.allowRemoteGit;q("#allow-shell").checked=s.allowUnsafeShell;q("#allow-sensitive").checked=s.allowSensitiveFiles;q("#pick-folder").disabled=!s.folderPickerSupported;syncPermissionControls()}
function syncPermissionControls(){const enabled=q("#allow-write").checked;for(const id of ["#allow-destructive","#allow-remote-git","#allow-shell","#allow-sensitive"]){const input=q(id);input.disabled=!enabled;if(!enabled)input.checked=false}}
function renderTunnel(){const t=state.tunnel||{state:"stopped"};const badge=q("#tunnel-badge");const select=q("#tunnel-provider");const labels={stopped:"Chưa chạy",starting:"Đang lấy URL…",running:"Đã kết nối",stopping:"Đang dừng…",failed:"Có lỗi"};if(t.provider)select.value=t.provider;badge.textContent=labels[t.state]||t.state;badge.className="status-pill "+(t.state==="running"?"good":t.state==="failed"?"bad":t.state==="starting"||t.state==="stopping"?"warn":"");const busy=t.state==="starting"||t.state==="running"||t.state==="stopping";select.disabled=busy;q("#start-tunnel").disabled=busy;q("#stop-tunnel").disabled=t.state==="stopped";q("#pinggy-url").value=t.publicUrl||"";q("#copy-pinggy").disabled=!t.publicUrl;const error=q("#tunnel-error");error.hidden=!t.error;error.textContent=t.error||"";if(t.publicUrl&&(!state.secret||!state.secret.connectorUrl))state.secret=null;renderSecrets()}
function renderSecrets(){const secret=state.secret;q("#mcp-token").type=state.tokenVisible?"text":"password";q("#mcp-token").value=secret&&state.tokenVisible?secret.mcpToken:"••••••••••••••••••••••••";q("#reveal-token").textContent=state.tokenVisible?"Ẩn":"Hiện";q("#connector-url").type=state.connectorVisible?"text":"password";q("#connector-url").value=secret&&secret.connectorUrl?(state.connectorVisible?secret.connectorUrl:"••••••••••••••••••••••••••••••••"):"";q("#reveal-connector").textContent=state.connectorVisible?"Ẩn":"Hiện";q("#reveal-connector").disabled=!(state.tunnel&&state.tunnel.publicUrl);q("#copy-connector").disabled=!(state.tunnel&&state.tunnel.publicUrl)}
function renderRows(){const tasks=state.tasks||[];q("#task-count").textContent=String(tasks.length);q("#tasks").replaceChildren(...(tasks.length?tasks.map(task=>{const row=el("div","row");row.append(el("strong","",task.name),el("span","",task.description),el("time","","được phép"));return row}):[el("div","empty","Chưa có task trong .local-coder/tasks.json")]));const events=state.events||[];q("#activity").replaceChildren(...(events.length?events.slice(0,8).map(event=>{const row=el("div","row");row.append(el("strong","",event.tool),el("span","",event.action+" · "+event.outcome),el("time","",new Date(event.timestamp).toLocaleTimeString("vi-VN")));return row}):[el("div","empty","Chưa có tool call")]));q("#checkpoint-count").textContent=String((state.checkpoints||[]).length)+" checkpoint"}
async function ensureSecret(force=false){if(!state.secret||force)state.secret=await api("/api/secret",{method:"POST"});return state.secret}
async function load(){try{const values=await Promise.all([api("/api/status"),api("/api/settings"),api("/api/tunnel"),api("/api/tasks"),api("/api/audit"),api("/api/checkpoints")]);state.status=values[0];state.settings=values[1];state.tunnel=values[2];state.tasks=values[3].tasks;state.events=values[4].events;state.checkpoints=values[5].checkpoints;renderStatus();renderSettings();renderTunnel();renderRows()}catch(error){toast(error.message,true)}}
q("#refresh").addEventListener("click",load);
q("#allow-write").addEventListener("change",syncPermissionControls);
q("#start-tunnel").addEventListener("click",async()=>{const provider=q("#tunnel-provider").value;const label=provider==="cloudflared"?"Cloudflare":"Pinggy";try{state.secret=null;state.tunnel=await api("/api/tunnel/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({provider})});renderTunnel();toast("Đang mở "+label+", chờ URL xuất hiện…")}catch(error){toast(error.message,true)}});
q("#stop-tunnel").addEventListener("click",async()=>{try{state.tunnel=await api("/api/tunnel/stop",{method:"POST"});state.secret=null;renderTunnel();toast("Đã dừng tunnel")}catch(error){toast(error.message,true)}});
q("#copy-pinggy").addEventListener("click",()=>copy(state.tunnel&&state.tunnel.publicUrl,"URL public").catch(error=>toast(error.message,true)));
q("#reveal-token").addEventListener("click",async()=>{try{await ensureSecret();state.tokenVisible=!state.tokenVisible;renderSecrets()}catch(error){toast(error.message,true)}});
q("#copy-token").addEventListener("click",async()=>{try{const secret=await ensureSecret();await copy(secret.mcpToken,"MCP_TOKEN")}catch(error){toast(error.message,true)}});
q("#reveal-connector").addEventListener("click",async()=>{try{await ensureSecret(true);state.connectorVisible=!state.connectorVisible;renderSecrets()}catch(error){toast(error.message,true)}});
q("#copy-connector").addEventListener("click",async()=>{try{const secret=await ensureSecret(true);if(!secret.connectorUrl)throw new Error("URL token đang tắt. Hãy dùng OpenAI Secure MCP Tunnel theo docs/secure-tunnel.md");await copy(secret.connectorUrl,"URL connector")}catch(error){toast(error.message,true)}});
q("#pick-folder").addEventListener("click",async()=>{const button=q("#pick-folder");button.disabled=true;button.textContent="Đang chờ…";try{const result=await api("/api/folder-picker",{method:"POST"});if(result.selected){q("#workspace-path").value=result.selected;q("#save-state").textContent="Chưa lưu"}else toast("Bạn chưa chọn thư mục")}catch(error){toast("Không mở được hộp chọn. Bạn có thể dán đường dẫn vào ô.",true)}finally{button.disabled=false;button.textContent="📁 Chọn thư mục"}});
q("#workspace-path").addEventListener("input",()=>q("#save-state").textContent="Chưa lưu");
for(const id of ["#allow-write","#allow-destructive","#allow-remote-git","#allow-shell","#allow-sensitive"])q(id).addEventListener("change",()=>q("#save-state").textContent="Chưa lưu");
q("#save-settings").addEventListener("click",async()=>{const button=q("#save-settings");button.disabled=true;try{const body={workspacePath:q("#workspace-path").value,permissionMode:q("#allow-write").checked?"workspace-write":"read-only",allowDestructive:q("#allow-destructive").checked,allowRemoteGit:q("#allow-remote-git").checked,allowUnsafeShell:q("#allow-shell").checked,allowSensitiveFiles:q("#allow-sensitive").checked};const result=await api("/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});state.settings=result.settings;state.secret=null;q("#save-state").textContent="Đã lưu";await load();toast("Đã lưu và áp dụng cài đặt!")}catch(error){toast(error.message,true)}finally{button.disabled=false}});
q("#diagnostics").addEventListener("click",async()=>{const button=q("#diagnostics");button.disabled=true;try{const result=await api("/api/diagnostics",{method:"POST"});const box=q("#diagnostic-results");box.hidden=false;box.replaceChildren(...result.checks.map(check=>el("div","diagnostic "+(check.ok?"ok":""),(check.ok?"✓ ":"! ")+check.name+" — "+check.detail)));toast(result.ok?"Kiểm tra hoàn tất":"Có mục cần chú ý",!result.ok)}catch(error){toast(error.message,true)}finally{button.disabled=false}});
q("#test-connection").addEventListener("click",async()=>{const button=q("#test-connection");const panel=q("#test-connection-panel");const summary=q("#test-panel-summary");const stepsBox=q("#test-panel-steps");button.disabled=true;button.textContent="⏳ Đang kiểm tra toàn diện…";panel.hidden=false;summary.textContent="Đang kiểm tra kết nối…";summary.className="";stepsBox.replaceChildren(el("div","test-step-loading","Đang kiểm tra Local Server, Public Tunnel và MCP Handshake…"));try{const res=await api("/api/test-connection",{method:"POST"});summary.textContent=(res.ok?"✓ ":"! ")+res.summary;summary.className=res.ok?"good":"warn";const steps=[res.steps.localServer,res.steps.tunnel,res.steps.protocol,res.steps.chatgpt];stepsBox.replaceChildren(...steps.map(s=>{const row=el("div","test-step "+(s.ok?"ok":"fail"));const top=el("div","test-step-head");top.append(el("strong","",(s.ok?"✓ ":"✕ ")+s.name));if(s.latencyMs!==undefined)top.append(el("span","latency-pill",s.latencyMs+"ms"));row.append(top,el("small","",s.detail));return row}));toast(res.ok?"Kết nối ChatGPT ↔ Máy tính hoàn hảo!":"Kiểm tra xong: có mục cần chú ý",!res.ok)}catch(error){summary.textContent="✕ Lỗi kiểm tra kết nối";summary.className="bad";stepsBox.replaceChildren(el("div","test-step fail",error.message));toast(error.message,true)}finally{button.disabled=false;button.textContent="⚡ Kiểm tra kết nối ChatGPT ↔ Máy tính"}});
q("#close-test-panel").addEventListener("click",()=>{q("#test-connection-panel").hidden=true});
setInterval(async()=>{if(!state.tunnel)return;try{state.tunnel=await api("/api/tunnel");renderTunnel()}catch{}},2000);
load();

`;
