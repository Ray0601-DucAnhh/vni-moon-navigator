/** Camera-lock check: load the app (?debug=1), drag the globe at several
 *  moments after load and on several screen sizes, and test whether the
 *  camera keeps the user's rotation or is pulled back to the start view.
 *  Usage: node qa/e2e/repro-camera.mjs   (BASE default http://localhost:4173)
 *  Exit code 1 if any run is locked. */
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:4173";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(os.tmpdir(), "vni-cam-" + Date.now())}`, "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "about:blank"], { stdio: "ignore" });
for (let i = 0; i < 100; i++) { try { await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); break; } catch { await sleep(100); } }

async function open() {
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let seq = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result ?? m.error); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pend.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (x) => (await send("Runtime.evaluate", { expression: `(async()=>{${x}})()`, awaitPromise: true, returnByValue: true })).result?.value;
  return { send, ev, close: async () => { ws.close(); await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`); } };
}

const cam = (p) => p.ev(`const v = document.documentElement.dataset.vniCam; return v ? v.split(',').map(Number) : null;`);
const focus = (p) => p.ev(`return document.documentElement.dataset.vniFocus || ''`);
const angle = (a, b) => {
  const n = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const [x, y] = [n(a), n(b)];
  return (Math.acos(Math.max(-1, Math.min(1, x[0] * y[0] + x[1] * y[1] + x[2] * y[2]))) * 180) / Math.PI;
};

async function run(vp, dragAfterMs) {
  const p = await open();
  await p.send("Runtime.enable");
  await p.send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr ?? 1, mobile: !!vp.mobile });
  await p.send("Page.navigate", { url: `${BASE}/?debug=1` });
  for (let i = 0; i < 300; i++) { if (await p.ev(`return !!document.querySelector('canvas') && !document.querySelector('.center-fill')`)) break; await sleep(100); }
  await sleep(dragAfterMs);
  const before = await cam(p);
  const fBefore = await focus(p);
  const cx = Math.round(vp.w / 2), cy = Math.round(vp.h / 2);
  await p.send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "left", clickCount: 1 });
  for (let k = 1; k <= 12; k++) { await p.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx + k * 18, y: cy + k * 6, button: "left", buttons: 1 }); await sleep(16); }
  await p.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx + 216, y: cy + 72, button: "left", clickCount: 1 });
  await sleep(400);
  const after = await cam(p);
  await sleep(3000);
  const later = await cam(p);
  const fLater = await focus(p);
  await p.close();
  const moved = before && after ? angle(before, after) : NaN;
  const kept = before && later ? angle(before, later) : NaN;
  const locked = !(kept > 5);
  return { vp: `${vp.w}x${vp.h}${vp.mobile ? "m" : ""}`, dragAfterMs, moved: moved.toFixed(1), kept: kept.toFixed(1), locked, fBefore, fLater };
}

const viewports = [
  { w: 1440, h: 900 }, { w: 1920, h: 1080 }, { w: 1280, h: 720 }, { w: 1366, h: 768 },
  { w: 800, h: 600 }, { w: 375, h: 812, dpr: 2, mobile: true }, { w: 412, h: 915, dpr: 2, mobile: true },
];
const times = (process.env.TIMES ?? "0,800,3000,8000").split(",").map(Number);
let bad = 0;
for (const vp of viewports) {
  for (const t of times) {
    const r = await run(vp, t);
    if (r.locked) bad++;
    console.log(`${r.locked ? "LOCKED" : "ok    "} ${r.vp.padEnd(10)} drag@+${String(t).padEnd(5)}ms moved ${r.moved.padStart(5)}° kept ${r.kept.padStart(5)}° | before: ${r.fBefore} | 3 s later: ${r.fLater}`);
  }
}
console.log(`\n${bad} locked run(s)`);
chrome.kill();
process.exit(bad ? 1 : 0);
