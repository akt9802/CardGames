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

  await send("Page.navigate", { url: "http://localhost:5173/register" });
  await sleep(800);
  await evalExpr(`
    (() => {
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const inputs = [...document.querySelectorAll('input')];
      const fire = (el, v) => { set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
      fire(inputs[0], '${user}');
      fire(inputs[1], '${user}');
      fire(inputs[2], 'secret');
      document.querySelector('button[type=submit]').click();
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
