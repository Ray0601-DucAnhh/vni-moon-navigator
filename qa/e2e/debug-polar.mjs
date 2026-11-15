/** Dev helper: open the app headless with ?debug=1, turn on the polar map,
 *  print the polar-map debug state and console messages, save a screenshot.
 *  Usage: node qa/e2e/debug-polar.mjs  (BASE default http://localhost:4173) */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:4173";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(os.tmpdir(), "vni-dbg-" + Date.now())}`, "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "about:blank"], { stdio: "ignore" });
for (let i = 0; i < 100; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(100); } }
const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0; const pend = new Map(); const logs = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); } else if (m.method === "Runtime.consoleAPICalled") logs.push(m.params.type + ": " + m.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 400)); };
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: `(async()=>{${x}})()`, awaitPromise: true, returnByValue: true })).result?.value;
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: `${BASE}/?debug=1` });
for (let i = 0; i < 200; i++) { if (await ev(`return !!document.querySelector('canvas') && !document.querySelector('.center-fill')`)) break; await sleep(150); }
await sleep(1500);
await ev(`[...document.querySelectorAll('.topbar button')].find(b => b.textContent.trim() === 'Polar map').click();`);
await sleep(6000);
console.log("polar debug:", await ev(`return document.documentElement.dataset.vniPolar`));
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(process.env.SHOT ?? "qa/screenshots/polar/debug.png", Buffer.from(shot.data, "base64"));
console.log(logs.join("\n"));
ws.close(); chrome.kill();
process.exit(0);
