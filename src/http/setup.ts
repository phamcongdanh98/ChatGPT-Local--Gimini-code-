import http from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "../security/rate-limit.js";
import { createInitialConfiguration } from "../services/initial-setup.js";
import { pickWorkspaceFolder } from "../services/folder-picker.js";

export interface RunningSetupServer {
  port: number;
  completed: Promise<void>;
  close: () => Promise<void>;
}

const SETUP_HTML = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Thiết lập ChatGPT Local Secure</title><style>
:root{color-scheme:dark;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#080b10;color:#f5f7fa}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at 50% 0,#16352d 0,transparent 38%),#080b10}.card{width:min(620px,100%);border:1px solid #2d3a46;border-radius:22px;background:#111720;padding:clamp(24px,6vw,44px);box-shadow:0 30px 90px #0008}.logo{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:#5ce0b5;color:#0a3328;font-weight:900}.eyebrow{color:#5ce0b5;font-size:11px;font-weight:900;letter-spacing:.14em;margin:24px 0 8px}h1{font-size:clamp(30px,7vw,48px);letter-spacing:-.05em;line-height:1.02;margin:0 0 12px}p{color:#9cabb8;line-height:1.6;margin:0 0 24px}.field{display:block;margin:18px 0}.field>span{display:block;font-size:12px;font-weight:800;margin-bottom:8px}.row{display:flex;gap:8px}input,button{font:inherit;border-radius:11px;border:1px solid #344351}input{min-width:0;flex:1;background:#090d12;color:#8cc1ff;padding:13px}.button{cursor:pointer;padding:13px 16px;background:#19222d;color:#fff;font-weight:800}.primary{width:100%;margin-top:18px;background:#5ce0b5;border-color:#5ce0b5;color:#082a21;font-size:15px}.button:disabled{opacity:.5;cursor:wait}.choices{display:grid;grid-template-columns:1fr 1fr;gap:9px}.choice{position:relative;border:1px solid #344351;border-radius:13px;padding:14px;background:#151d27;cursor:pointer}.choice input{position:absolute;opacity:0}.choice:has(input:checked){border-color:#5ce0b5;background:#10271f}.choice strong,.choice small{display:block}.choice small{color:#9cabb8;margin-top:5px;line-height:1.4}.message{min-height:22px;margin:14px 0 0;font-size:12px;color:#ff9696}.message.good{color:#5ce0b5}@media(max-width:560px){.row,.choices{display:grid;grid-template-columns:1fr}.row button{width:100%}}
</style></head><body><main class="card"><div class="logo">LS</div><p class="eyebrow">THIẾT LẬP 1 LẦN</p><h1>Chọn project.<br>Thế là xong.</h1><p>Ứng dụng tự tạo token và cấu hình an toàn. Bạn không cần sửa file hay dùng dòng lệnh.</p><form id="setup-form"><label class="field"><span>Thư mục project</span><div class="row"><input id="workspace" name="workspacePath" placeholder="Bấm Chọn thư mục" autocomplete="off" required><button id="pick" class="button" type="button">Chọn thư mục</button></div></label><div class="field"><span>ChatGPT được phép làm gì?</span><div class="choices"><label class="choice"><input type="radio" name="permissionMode" value="workspace-write" checked><strong>Đọc và sửa code</strong><small>Phù hợp để làm việc hằng ngày. Xóa file, shell và Git remote vẫn tắt.</small></label><label class="choice"><input type="radio" name="permissionMode" value="read-only"><strong>Chỉ đọc code</strong><small>An toàn nhất khi bạn chỉ muốn xem và phân tích project.</small></label></div></div><button id="start" class="button primary" type="submit">Bắt đầu sử dụng</button><p id="message" class="message" role="status"></p></form></main><script src="/setup.js" defer></script></body></html>`;

const SETUP_JS = `
const q=(s)=>document.querySelector(s);const message=q("#message");const action={"X-Local-Setup":"1"};
q("#pick").addEventListener("click",async()=>{const button=q("#pick");button.disabled=true;message.textContent="Đang mở hộp chọn thư mục…";try{const response=await fetch("/api/pick",{method:"POST",headers:action});const data=await response.json();if(!response.ok)throw new Error(data.error||"Không mở được hộp chọn thư mục");if(data.selected)q("#workspace").value=data.selected;message.textContent=data.selected?"Đã chọn project.":"Bạn chưa chọn thư mục.";message.className="message "+(data.selected?"good":"")}catch(error){message.textContent=error.message;message.className="message"}finally{button.disabled=false}});
q("#setup-form").addEventListener("submit",async(event)=>{event.preventDefault();const button=q("#start");button.disabled=true;button.textContent="Đang thiết lập…";message.textContent="Đang tạo cấu hình an toàn…";message.className="message good";const mode=document.querySelector('input[name="permissionMode"]:checked').value;try{const response=await fetch("/api/setup",{method:"POST",headers:{...action,"Content-Type":"application/json"},body:JSON.stringify({workspacePath:q("#workspace").value,permissionMode:mode})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Thiết lập thất bại");button.textContent="Đang mở dashboard…";message.textContent="Hoàn tất. Dashboard đang khởi động…";for(let attempt=0;attempt<40;attempt+=1){await new Promise(resolve=>setTimeout(resolve,500));try{const ready=await fetch("/bootstrap-session/"+encodeURIComponent(data.handoffToken));if(ready.ok){location.replace("/ui");return}}catch{}}throw new Error("Dashboard khởi động lâu hơn dự kiến. Hãy đóng rồi mở app lại.")}catch(error){message.textContent=error.message;message.className="message";button.disabled=false;button.textContent="Bắt đầu sử dụng"}});`;

export async function startSetupServer(options: {
  projectRoot: string;
  port?: number;
  handoffToken: string;
  pickFolder?: () => Promise<string | undefined>;
}): Promise<RunningSetupServer> {
  let resolveCompleted!: () => void;
  let completedOnce = false;
  const completed = new Promise<void>((resolve) => { resolveCompleted = resolve; });
  const app = express();
  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "DENY");
    next();
  });
  const requireAction = (request: Request, response: Response, next: NextFunction): void => {
    if (request.get("x-local-setup") !== "1") { response.status(403).json({ error: "Yêu cầu thiết lập không hợp lệ" }); return; }
    next();
  };
  app.get("/", (_request, response) => response.redirect(303, "/setup"));
  app.get("/setup", (_request, response) => response.type("html").send(SETUP_HTML));
  app.get("/setup.js", (_request, response) => response.type("js").send(SETUP_JS));
  app.post("/api/pick", rateLimit(10), requireAction, async (request, response) => {
    try { response.json({ selected: await (options.pickFolder ?? pickWorkspaceFolder)() ?? null }); }
    catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : "Không chọn được thư mục" }); }
  });
  app.post("/api/setup", rateLimit(10), requireAction, express.json({ limit: 8 * 1024, strict: true }), async (request, response) => {
    if (completedOnce) { response.status(409).json({ error: "Thiết lập đã hoàn tất" }); return; }
    try {
      const workspacePath = typeof request.body?.workspacePath === "string" ? request.body.workspacePath : "";
      const permissionMode = request.body?.permissionMode;
      await createInitialConfiguration(options.projectRoot, { workspacePath, permissionMode });
      completedOnce = true;
      response.json({ ok: true, handoffToken: options.handoffToken });
      setTimeout(resolveCompleted, 100).unref();
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Không thể tạo cấu hình" });
    }
  });
  app.use((_error: unknown, _request: Request, response: Response, _next: NextFunction) => response.status(400).json({ error: "Dữ liệu không hợp lệ" }));
  const server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 3001, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Không mở được giao diện thiết lập");
  return {
    port: address.port,
    completed,
    close: async () => await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}
