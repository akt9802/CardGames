import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import WebSocket from "ws";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9333;
const user = "ui_" + Math.floor(Math.random() * 99999);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function cdp() {
  const chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    "--disable-gpu",
    "--no-first-run",
    "--user-data-dir=/tmp/baithak-chrome",
    "http://localhost:5173/",
  ], { stdio: "ignore" });

  let wsUrl = "";
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = tabs.find((t: { type: string }) => t.type === "page");
      if (page?.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {
      /* wait */
    }
  }
  if (!wsUrl) throw new Error("no cdp");

  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.once("open", r));
  let id = 0;
  const pending = new Map<number, (v: unknown) => void>();
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.id && pending.has(msg.id)) pending.get(msg.id)!(msg);
  });
  function send(method: string, params: Record<string, unknown> = {}) {
    const n = ++id;
    ws.send(JSON.stringify({ id: n, method, params }));
    return new Promise<any>((resolve) => pending.set(n, resolve));
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.id && pending.has(msg.id)) pending.get(msg.id)!(msg);
    if (msg.method === "Runtime.exceptionThrown") {
      console.log("EXC", msg.params.exceptionDetails?.text, msg.params.exceptionDetails?.exception?.description);
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      console.log("CON", msg.params.args?.map((a: any) => a.value ?? a.description).join(" "));
    }
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(400);

  async function shot(name: string) {
    const res = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`/Users/amirzakaria/Desktop/games/.tmp-${name}.png`, Buffer.from(res.result.data, "base64"));
  }

  async function evalExpr(expression: string) {
    const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (res.result.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails));
    return res.result.result.value;
  }

  await send("Page.navigate", { url: "http://localhost:5173/request-access" });
  await sleep(600);
  await shot("request-access");
  await evalExpr(`
    (async () => {
      const email = '${user}@e2e.local';
      const req = (path, body, token) => fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify(body),
      }).then(r => r.json());
      await req('/api/access/request', { name: '${user}', email, reason: 'ui shot needs a chair at the table' });
      const admin = await req('/api/admin/login', { username: 'zakAddKK', password: '12qw!@QWzak765' });
      const list = await fetch('/api/admin/requests?status=PENDING', { headers: { Authorization: 'Bearer ' + admin.token } }).then(r => r.json());
      const rec = list.requests.find(r => r.email === email);
      await req('/api/admin/requests/' + rec.id + '/approve', {}, admin.token);
      const otpRes = await req('/api/signup/request-otp', { email });
      const ver = await req('/api/signup/verify-otp', { email, otp: otpRes.otp });
      const session = await req('/api/signup/complete', { setup_token: ver.setup_token, username: '${user}', password: 'secret', displayName: '${user}' });
      localStorage.setItem('baithak-session', JSON.stringify(session));
      location.href = '/lobby';
      return true;
    })()
  `);
  await sleep(1500);
  await shot("lobby");

  const clicked = await evalExpr(`
    (() => {
      const btns = [...document.querySelectorAll('button')];
      const solo = btns.find(b => /alone vs computers/i.test(b.textContent));
      if (solo) { solo.click(); return 'clicked:' + solo.textContent; }
      return 'buttons:' + btns.map(b => b.textContent.trim()).join(' | ');
    })()
  `);
  console.log(clicked);
  await sleep(3000);
  const loc = await evalExpr(`location.pathname + ' html=' + (document.getElementById('root')?.innerHTML.length ?? 0)`);
  console.log(loc);
  const logs = await send("Runtime.evaluate", {
    expression: "window.__errs || 'none'",
    returnByValue: true,
  });
  console.log("errs", logs.result?.result?.value);
  await shot("play");

  ws.close();
  chrome.kill();
}

cdp().catch((e) => {
  console.error(e);
  process.exit(1);
});
