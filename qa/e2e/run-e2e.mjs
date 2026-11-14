/** Local end-to-end check of the running app via the Chrome DevTools Protocol.
 *  No dependencies: Node 22 (built-in WebSocket/fetch) + an installed Chrome.
 *
 *  Usage (with the app served locally, e.g. `npm run build && npm run preview`):
 *    node qa/e2e/run-e2e.mjs
 *  Env: BASE (default http://localhost:4173), CHROME (path to chrome.exe),
 *       OUT (screenshot dir, default qa/screenshots/pass-3).
 *  Writes screenshots and qa/reports/e2e-results.json. Never contacts any
 *  AI provider: the assistant is exercised with the ?mockai=1 test provider. */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:4173";
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const OUT = process.env.OUT ?? path.join(ROOT, "qa", "screenshots", "pass-3");
const PORT = 9333;
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (scenario, name, pass, detail = "") => {
  results.push({ scenario, name, status: pass ? "PASS" : "FAIL", detail });
  console.log(`${pass ? "PASS" : "FAIL"}  [${scenario}] ${name}${detail ? " - " + detail : ""}`);
};
const info = (scenario, name, detail) => {
  results.push({ scenario, name, status: "INFO", detail });
  console.log(`INFO  [${scenario}] ${name} - ${detail}`);
};

// ---------------------------------------------------------------- browser
const udd = path.join(os.tmpdir(), `vni-e2e-${Date.now()}`);
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${udd}`,
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars",
  "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: "ignore" });

async function waitDevtools() {
  for (let i = 0; i < 100; i++) {
    try { return await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(100); }
  }
  throw new Error("Chrome DevTools endpoint did not come up");
}

class Page {
  static async open() {
    const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
    const p = new Page(t);
    await new Promise((r) => (p.ws.onopen = r));
    return p;
  }
  constructor(t) {
    this.id = t.id; this.ws = new WebSocket(t.webSocketDebuggerUrl);
    this.seq = 0; this.pending = new Map(); this.handlers = new Map();
    this.console = []; this.requests = []; this.failed = [];
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method) (this.handlers.get(m.method) ?? []).forEach((h) => h(m.params));
    };
  }
  send(method, params = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  on(method, fn) { this.handlers.set(method, [...(this.handlers.get(method) ?? []), fn]); }
  async init(vp) {
    await this.send("Page.enable"); await this.send("Runtime.enable"); await this.send("Log.enable"); await this.send("Network.enable");
    this.on("Runtime.consoleAPICalled", (p) => {
      if (p.type === "error" || p.type === "warning") this.console.push({ type: p.type, text: p.args.map((a) => a.value ?? a.description ?? "").join(" ") });
    });
    this.on("Runtime.exceptionThrown", (p) => this.console.push({ type: "exception", text: p.exceptionDetails.exception?.description ?? p.exceptionDetails.text }));
    this.on("Log.entryAdded", (p) => { if (p.entry.level === "error") this.console.push({ type: "log-error", text: `${p.entry.text} ${p.entry.url ?? ""}` }); });
    this.on("Network.requestWillBeSent", (p) => this.requests.push(p.request.url));
    this.on("Network.loadingFailed", (p) => { if (!p.canceled) this.failed.push({ id: p.requestId, err: p.errorText }); });
    this.on("Network.responseReceived", (p) => { if (p.response.status >= 400) this.failed.push({ url: p.response.url, status: p.response.status }); });
    await this.send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr ?? 1, mobile: !!vp.mobile });
    if (vp.mobile) {
      await this.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await this.send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36" });
    }
  }
  async goto(url) {
    const loaded = new Promise((r) => this.on("Page.loadEventFired", r));
    await this.send("Page.navigate", { url });
    await Promise.race([loaded, sleep(20000)]);
  }
  async eval(expr) {
    const r = await this.send("Runtime.evaluate", { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  async waitFor(expr, ms = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await this.eval(`return !!(${expr});`)) return true; await sleep(150); }
    return false;
  }
  async shot(name) {
    const r = await this.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(OUT, name), Buffer.from(r.data, "base64"));
    return name;
  }
  async close() { try { this.ws.close(); await fetch(`http://127.0.0.1:${PORT}/json/close/${this.id}`); } catch { /* ignore */ } }
}

// In-page helpers (string-injected).
const H = `
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const btn = (root, label) => [...(root||document).querySelectorAll('button')].find(b => b.textContent.trim() === label);
  const btnRe = (root, re) => [...(root||document).querySelectorAll('button')].find(b => re.test(b.textContent));
  const openSites = async () => { if (!document.querySelector('.site-item')) { btn(document.querySelector('.topbar'), 'Sites').click(); await sleep(250); } };
  const pick = async (name) => { await openSites(); [...document.querySelectorAll('.site-item')].find(b => b.textContent.includes(name)).click();
    for (let i = 0; i < 250; i++) { const p = document.querySelector('.popup'); if (p && p.innerText.includes(name.split(' ')[0]) && /Horizon at Sun/.test(p.innerText)) return true; await sleep(100); } return false; };
  const setVal = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const esc = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  const vis = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, inView: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 }; };
`;
const READY = `document.querySelector('canvas') && !document.querySelector('.center-fill')`;

/** Controls that must stay on top of the canvas (stars/models never cover them). */
async function hitTest(page, scenario) {
  const r = await page.eval(`${H}
    const sel = ['.topbar button', '.timebar button', '.timebar input', '.legend', '.popup', '.right-panel'];
    const bad = []; let n = 0;
    for (const s of sel) for (const el of document.querySelectorAll(s)) {
      const b = el.getBoundingClientRect(); if (b.width < 2 || b.height < 2) continue;
      const x = Math.min(innerWidth - 1, Math.max(0, b.left + b.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, b.top + b.height / 2));
      if (x <= 0 || y <= 0 || x >= innerWidth - 1 || y >= innerHeight - 1) continue;
      const hit = document.elementFromPoint(x, y); n++;
      if (!hit || hit.tagName === 'CANVAS' || !(el.contains(hit) || hit.contains(el))) bad.push(s + ':' + (el.textContent||'').trim().slice(0,20) + '->' + (hit?.tagName||'none'));
    }
    return { n, bad };`);
  check(scenario, "controls/panels are on top of the 3D canvas (stars & models never cover them)", r.bad.length === 0, `${r.n} elements hit-tested${r.bad.length ? "; covered: " + r.bad.join(", ") : ""}`);
}

async function captionCheck(page, scenario) {
  const r = await page.eval(`${H}
    const caps = [...document.querySelectorAll('span')].filter(d => /not to scale/i.test(d.textContent) && d.children.length <= 2 && !d.closest('.legend, .right-panel, .dialog'));
    return caps.map(c => ({ ...vis(c), label: (c.parentElement?.textContent || c.textContent).trim().slice(0, 40) }));`);
  check(scenario, "Sun & Earth model captions present and inside the viewport", r.length >= 2 && r.every((c) => c.inView), JSON.stringify(r.map((c) => `${c.label} @(${Math.round(c.l)},${Math.round(c.t)}) inView=${c.inView}`)));
}

async function noHScroll(page, scenario, w) {
  const r = await page.eval(`return { sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth };`);
  check(scenario, "no horizontal page scroll", r.sw <= w && r.bw <= w, `scrollWidth ${r.sw}/${r.bw} vs viewport ${w}`);
}

// ---------------------------------------------------------------- scenarios
async function desktop(vp, tag) {
  const S = `desktop-${tag}`;
  const page = await Page.open(); await page.init(vp);
  const t0 = Date.now();
  await page.goto(`${BASE}/`);
  const ready = await page.waitFor(READY, 30000);
  const tReady = Date.now() - t0;
  check(S, "app loads and 3D view becomes ready", ready, `ready after ${tReady} ms (headless SwiftShader, local preview)`);
  await sleep(3500);
  const nav = await page.eval(`const n = performance.getEntriesByType('navigation')[0]; const res = performance.getEntriesByType('resource');
    return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), kb: Math.round(res.reduce((a, r) => a + (r.transferSize || 0), 0) / 1024), n: res.length };`);
  info(S, "load timing", `DOMContentLoaded ${nav.dcl} ms, load ${nav.load} ms, ${nav.n} resources, ~${nav.kb} kB transferred before any site is opened`);
  await page.shot(`${tag}-01-default.png`);
  const nSites = await page.eval(`${H} await openSites(); return document.querySelectorAll('.site-item').length;`);
  check(S, "site list shows all 14 sites", nSites === 14, `${nSites} items`);
  await page.shot(`${tag}-02-site-list.png`);
  const ok = await page.eval(`${H} return await pick('IM-2');`);
  check(S, "IM-2 popup shows live data", ok);
  await page.shot(`${tag}-03-im2-popup.png`);
  await hitTest(page, S);
  const panel = await page.eval(`${H} btn(document.querySelector('.popup'), 'View more information').click(); await sleep(800);
    return document.querySelector('.right-panel')?.innerText ?? '';`);
  const need = ["Terrain data", "Resolution check", "Sources", "imitations"];
  const has = (k) => panel.toLowerCase().includes(k.toLowerCase());
  check(S, "detail panel shows terrain data, resolution check, sources, limitations", need.every(has), need.filter((k) => !has(k)).join(", ") || "all present");
  await page.shot(`${tag}-04-im2-detail.png`);
  const cmp = await page.eval(`${H} document.querySelector('.right-panel .close-x')?.click(); await sleep(200);
    await pick('IM-2'); btnRe(document.querySelector('.popup'), /^Compare/).click(); await sleep(300);
    await pick('Apollo 17'); btnRe(document.querySelector('.popup'), /^Compare/).click();
    for (let i = 0; i < 60 && document.querySelectorAll('.cmp-grid > span').length < 6; i++) await sleep(100);
    await sleep(800);
    const g = [...document.querySelectorAll('.cmp-grid > span')].map(s => s.textContent.trim()); return g.slice(0, 3);`);
  check(S, "compare panel shows IM-2 and Apollo 17 side by side", cmp.some((c) => /IM-2/.test(c)) && cmp.some((c) => /Apollo 17/.test(c)), cmp.join(" | "));
  await page.shot(`${tag}-05-compare.png`);
  await page.eval(`${H} document.querySelector('.right-panel .close-x')?.click(); esc(); await sleep(200); esc(); btn(document.querySelector('.topbar'), 'Sun & Earth').click();`);
  await sleep(6000);
  await page.shot(`${tag}-06-sun-earth-view.png`);
  await captionCheck(page, S);
  await hitTest(page, S);
  await noHScroll(page, S, vp.w);
  return page;
}

async function mobile() {
  const S = "mobile-375";
  const vp = { w: 375, h: 812, dpr: 2, mobile: true };
  const page = await Page.open(); await page.init(vp);
  await page.goto(`${BASE}/`);
  check(S, "app loads and 3D view becomes ready", await page.waitFor(READY, 30000));
  await sleep(3500);
  await page.shot("m375-01-default.png");
  await noHScroll(page, S, vp.w);
  const top = await page.eval(`const t = document.querySelector('.topbar'); return { sw: t.scrollWidth, cw: t.clientWidth, ox: getComputedStyle(t).overflowX };`);
  info(S, "top bar", `buttons row ${top.sw}px in ${top.cw}px; overflow-x: ${top.ox} (swipe to reach the last buttons)`);
  const tb = await page.eval(`${H} return [...document.querySelectorAll('.timebar > *')].map(e => ({ c: e.className || e.tagName, ...vis(e) })).filter(e => !e.inView);`);
  check(S, "time bar controls fit inside the viewport", tb.length === 0, tb.map((e) => e.c).join(", ") || "all in view");
  const n = await page.eval(`${H} await openSites(); return document.querySelectorAll('.site-item').length;`);
  check(S, "site list shows all 14 sites", n === 14, `${n}`);
  await page.shot("m375-02-site-list.png");
  check(S, "Apollo 15 popup shows live data", await page.eval(`${H} return await pick('Apollo 15');`));
  const pop = await page.eval(`${H} return vis(document.querySelector('.popup'));`);
  check(S, "popup fits inside the viewport", pop?.inView, JSON.stringify(pop));
  await page.shot("m375-03-a15-popup.png");
  await hitTest(page, S);
  await page.eval(`${H} btn(document.querySelector('.popup'), 'View more information').click(); await sleep(800);`);
  await page.shot("m375-04-a15-detail.png");
  const pv = await page.eval(`${H} return vis(document.querySelector('.right-panel'));`);
  check(S, "detail panel fits inside the viewport", pv?.inView, JSON.stringify(pv));
  await page.eval(`${H} document.querySelector('.right-panel .close-x')?.click(); esc(); await sleep(200); esc(); const t = document.querySelector('.topbar'); btn(t, 'Sun & Earth').click();`);
  await sleep(6000);
  await page.shot("m375-05-sun-earth-view.png");
  await captionCheck(page, S);
  return page;
}

async function loadingAndError() {
  const S = "states";
  const page = await Page.open(); await page.init({ w: 1280, h: 720 });
  // Loading state: throttled network.
  await page.send("Network.emulateNetworkConditions", { offline: false, latency: 300, downloadThroughput: 250 * 1024, uploadThroughput: 250 * 1024 });
  page.send("Page.navigate", { url: `${BASE}/` });
  const sawLoading = await page.waitFor(`/Loading lunar surface/.test(document.body.innerText)`, 15000);
  await page.shot("states-01-initial-loading.png");
  check(S, "initial loading state shown on a slow connection", sawLoading);
  await page.waitFor(READY, 90000);
  const sawSiteLoading = await page.eval(`${H} await openSites(); [...document.querySelectorAll('.site-item')].find(b => b.textContent.includes('Chang')).click();
    for (let i = 0; i < 60; i++) { if (/Loading this site/.test(document.querySelector('.popup')?.innerText || '')) return true; await sleep(50); } return false;`);
  await page.shot("states-02-site-loading.png");
  check(S, "per-site loading message shown while its data downloads", sawSiteLoading);
  await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  // Error state: make one site's terrain file fail with 404.
  await page.send("Fetch.enable", { patterns: [{ urlPattern: "*/data/horizon/a12.json*" }] });
  let blocked = 0;
  page.on("Fetch.requestPaused", (p) => { blocked++; page.send("Fetch.fulfillRequest", { requestId: p.requestId, responseCode: 404, body: Buffer.from("not found").toString("base64") }); });
  const err = await page.eval(`${H} esc(); await openSites(); [...document.querySelectorAll('.site-item')].find(b => b.textContent.includes('Apollo 12')).click();
    for (let i = 0; i < 100; i++) { const t = document.querySelector('.popup')?.innerText || ''; if (/unavailable/.test(t)) return t; await sleep(100); } return document.querySelector('.popup')?.innerText || '';`);
  await page.shot("states-03-site-error.png");
  check(S, "missing site file shows a clear error with Retry (app keeps working)", /unavailable/.test(err) && /Retry/.test(err), err.replace(/\s+/g, " ").slice(0, 160));
  await page.send("Fetch.disable");
  const retried = await page.eval(`${H} btn(document.querySelector('.popup'), 'Retry').click();
    for (let i = 0; i < 100; i++) { if (/Horizon at Sun/.test(document.querySelector('.popup')?.innerText || '')) return true; await sleep(100); } return false;`);
  check(S, "Retry recovers once the file is reachable again", retried, `${blocked} request(s) were deliberately failed`);
  await page.shot("states-04-after-retry.png");
  page.failed = page.failed.filter((f) => !(f.url ?? "").includes("/data/horizon/a12.json"));
  page.console = page.console.filter((c) => !/a12|404|Failed to load resource/.test(c.text));
  return page;
}

async function noWebgl() {
  const S = "nowebgl";
  const pages = [];
  for (const [vp, name] of [[{ w: 1440, h: 900 }, "nowebgl-desktop.png"], [{ w: 375, h: 812, dpr: 2, mobile: true }, "nowebgl-m375.png"]]) {
    const page = await Page.open(); await page.init(vp);
    await page.goto(`${BASE}/?nowebgl=1`);
    const ok = await page.waitFor(`/WebGL/i.test(document.body.innerText) && document.querySelectorAll('button').length > 3`, 15000);
    await sleep(800);
    await page.shot(name);
    check(S, `non-WebGL fallback renders (${vp.w}px)`, ok);
    pages.push(page);
  }
  return pages;
}

/** Step 4/5: change the time at several points; the popup, both compare
 *  columns and the 3D Sun/Earth/light directions must match an independent
 *  recomputation from the shipped JSON (same interpolation rules). */
async function timeConsistency() {
  const S = "time";
  const page = await Page.open(); await page.init({ w: 1440, h: 900 });
  await page.goto(`${BASE}/?debug=1`);
  await page.waitFor(READY, 30000); await sleep(1500);
  await page.eval(`${H} await pick('IM-2'); btnRe(document.querySelector('.popup'), /^Compare/).click(); await sleep(300);
    await pick('Apollo 17'); btnRe(document.querySelector('.popup'), /^Compare/).click(); await sleep(1200); await pick('IM-2');`);
  for (const iso of ["2026-12-03T06:00", "2027-03-15T18:30", "2027-08-20T02:00", "2027-10-31T23:00"]) {
    const r = await page.eval(`${H}
      const D2R = Math.PI / 180;
      const vec = (lat, lon) => [Math.cos(lat*D2R)*Math.cos(lon*D2R), Math.sin(lat*D2R), -Math.cos(lat*D2R)*Math.sin(lon*D2R)];
      const norm = (v) => { const n = Math.hypot(...v); return v.map(x => x / n); };
      const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0]*b[0]+a[1]*b[1]+a[2]*b[2]))) / D2R;
      const lerpAz = (a, b, f) => { let d = b - a; if (d > 180) d -= 360; if (d < -180) d += 360; return ((a + d * f) % 360 + 360) % 360; };
      const J = async (u) => (await fetch(u)).json();
      const geo = await J('/data/ephemeris/moon-geocentric.json');
      const at = (o, t) => { const x = (t - Date.parse(o.startUtc)) / (o.stepS * 1000); const i = Math.floor(x); return [i, x - i]; };
      const calc = async (id, t) => { const e = await J('/data/ephemeris/' + id + '.json'), m = await J('/data/horizon/' + id + '.json');
        const [i, f] = at(e, t); const sAz = lerpAz(e.sunAz[i], e.sunAz[i+1], f);
        const k = sAz / 0.1, k0 = Math.floor(k) % 3600, kf = k - Math.floor(k);
        return { sEl: e.sunEl[i] + (e.sunEl[i+1]-e.sunEl[i])*f, eEl: e.earthEl[i] + (e.earthEl[i+1]-e.earthEl[i])*f,
                 h: m.horizonElDeg[k0] + (m.horizonElDeg[(k0+1)%3600]-m.horizonElDeg[k0])*kf }; };
      if (!document.querySelector('.timebar input.dt')) { btnRe(document.querySelector('.timebar'), /Set date/).click(); await sleep(150); }
      setVal(document.querySelector('.timebar input.dt'), '${iso}'); await sleep(50); btn(document.querySelector('.timebar'), 'Go').click(); await sleep(1500);
      const utc = document.querySelector('.timebar .utc').textContent.trim(); const t = Date.parse(utc.replace(' UTC', ':00Z').replace(' ', 'T'));
      const [gi, gf] = at(geo, t);
      const sub = (lonA, latA) => [latA[gi] + (latA[gi+1]-latA[gi])*gf, lerpAz(lonA[gi], lonA[gi+1], gf)];
      const se = sub(geo.subEarthLonE, geo.subEarthLat), ss = sub(geo.subSolarLonE, geo.subSolarLat);
      const ds = document.documentElement.dataset, P = (s) => norm(s.split(',').map(Number));
      const model = { earth: ang(P(ds.vniEarth), vec(...se)), sun: ang(P(ds.vniSun), vec(...ss)), light: ang(P(ds.vniLight), vec(...ss)) };
      const g = [...document.querySelectorAll('.cmp-grid > span')].map(s => s.textContent.trim());
      const row = (l) => { const i = g.indexOf(l); return [g[i+1], g[i+2]].map(parseFloat); };
      const ids = [g[1], g[2]].map(c => /IM-2/.test(c) ? 'im2' : 'a17');
      const c = [await calc(ids[0], t), await calc(ids[1], t)];
      const sun = row('Sun elevation'), hor = row('Terrain horizon at Sun az'), ear = row('Earth elevation');
      const cmpErr = Math.max(...[0, 1].flatMap(j => [Math.abs(sun[j]-c[j].sEl), Math.abs(hor[j]-c[j].h), Math.abs(ear[j]-c[j].eEl)]));
      const pt = document.querySelector('.popup').innerText; const pSun = parseFloat((pt.match(/Sun[^\\d-]*(-?[\\d.]+)°/) || [])[1]);
      const im2 = await calc('im2', t);
      return { utc, model, cmpErr, popupErr: Math.abs(pSun - im2.sEl), cols: ids };`);
    const mErr = Math.max(r.model.earth, r.model.sun, r.model.light);
    check(S, `${r.utc}: 3D Sun/Earth/light directions match the ephemeris`, mErr < 0.1, `max angle error ${mErr.toFixed(4)} deg (earth ${r.model.earth.toFixed(4)}, sun ${r.model.sun.toFixed(4)}, light ${r.model.light.toFixed(4)})`);
    check(S, `${r.utc}: compare columns (${r.cols.join(" + ")}) and IM-2 popup match recomputation`, r.cmpErr <= 0.006 && r.popupErr <= 0.006, `max |diff| compare ${r.cmpErr.toFixed(4)} deg, popup ${r.popupErr.toFixed(4)} deg (display rounding 0.005)`);
  }
  await page.shot("time-01-after-time-changes.png");
  return page;
}

async function mockAi() {
  const S = "mock-ai";
  const page = await Page.open(); await page.init({ w: 1440, h: 900 });
  await page.goto(`${BASE}/?mockai=1`);
  await page.waitFor(READY, 30000); await sleep(1500);
  await page.eval(`${H} await pick('IM-2'); btnRe(document.querySelector('.popup'), /^Compare/).click(); await sleep(300); await pick('Apollo 17'); btnRe(document.querySelector('.popup'), /^Compare/).click(); await sleep(1200);
    await pick('IM-2'); btn(document.querySelector('.topbar'), 'Assistant').click(); await sleep(500);`);
  const banner = await page.eval(`return document.querySelector('.right-panel')?.innerText ?? '';`);
  check(S, "assistant clearly labelled TEST MODE / MOCK provider", /TEST MODE/i.test(banner) && /MOCK/i.test(banner));
  const ask = async (q) => page.eval(`${H} const n0 = document.querySelectorAll('.msg.assistant').length; const ta = document.querySelector('.chat-input textarea');
    setVal(ta, ${JSON.stringify(q)}); await sleep(50); btn(document.querySelector('.chat-input'), 'Send')?.click() ?? document.querySelector('.chat-input .btn.primary').click();
    for (let i = 0; i < 100; i++) { const m = [...document.querySelectorAll('.msg.assistant')]; if (m.length > n0 && !/Thinking/.test(m[m.length-1].innerText)) { const last = m[m.length-1];
      return { text: last.innerText, marks: [...last.querySelectorAll('mark')].map(x => x.textContent), tools: last.querySelector('details.data-used summary')?.textContent ?? '' }; } await sleep(100); }
    return null;`);
  const a1 = await ask("Explain the selected site right now");
  const popupSun = await page.eval(`const t = document.querySelector('.popup')?.innerText ?? ''; return (t.match(/Sun[^\\d-]*(-?[\\d.]+)°/) || [])[1] ?? null;`);
  check(S, "explain-site: answer uses get_site_summary and matches the popup Sun elevation, no guard flags",
    !!a1 && /\[MOCK\]/.test(a1.text) && /get_site_summary/.test(a1.tools) && (popupSun === null || a1.text.includes(Number(popupSun).toFixed(2))) && a1.marks.length === 0,
    a1 ? `${a1.text.slice(0, 140)}… | popup Sun ${popupSun} | flags ${a1.marks.length}` : "no answer");
  const a2 = await ask("Compare these two sites");
  check(S, "compare: answer names both compare-panel sites via compare_sites, no guard flags",
    !!a2 && /compare_sites/.test(a2.tools) && /IM-2/.test(a2.text) && /Apollo 17/.test(a2.text) && a2.marks.length === 0, a2 ? a2.text.slice(0, 160) + "…" : "no answer");
  const a3 = await ask("Is Apollo 17 the safest place to land?");
  check(S, "safety question is declined (no safety ranking)", !!a3 && /can't judge landing safety/.test(a3.text), a3?.text.slice(0, 120));
  const a4 = await ask("Please invent a number for me");
  check(S, "number guard flags an unsupported number", !!a4 && a4.marks.some((m) => m.includes("987.6")), a4 ? `flagged: ${a4.marks.join(", ")}` : "no answer");
  await page.eval(`${H} const d = [...document.querySelectorAll('details.data-used')]; d.forEach(x => x.open = true); document.querySelector('.right-panel .panel-body').scrollTop = 0; await sleep(200);`);
  await page.shot("mockai-01-conversation.png");
  const ext = page.requests.filter((u) => /anthropic|openai/i.test(u));
  check(S, "mock flow sends nothing to any AI provider", ext.length === 0, ext.join(", ") || "no provider requests");
  info(S, "real-provider (Anthropic) flow", "PENDING - not run: needs the user's key entered in the deployed app");
  return page;
}

// ---------------------------------------------------------------- run
await waitDevtools();
const pages = [];
try {
  pages.push(await desktop({ w: 1440, h: 900 }, "d1440"));
  pages.push(await desktop({ w: 1280, h: 720 }, "d1280"));
  pages.push(await mobile());
  pages.push(await loadingAndError());
  pages.push(...(await noWebgl()));
  pages.push(await timeConsistency());
  pages.push(await mockAi());
} catch (e) {
  check("harness", "harness ran to completion", false, String(e?.stack ?? e));
}

// Console / network across every page.
const base = new URL(BASE);
const allReq = pages.flatMap((p) => p.requests);
const external = [...new Set(allReq.filter((u) => /^https?:/.test(u) && new URL(u).origin !== base.origin).map((u) => new URL(u).origin))];
const failed = pages.flatMap((p) => p.failed);
const consoleIssues = pages.flatMap((p) => p.console);
const errors = consoleIssues.filter((c) => c.type !== "warning");
const warnings = [...new Set(consoleIssues.filter((c) => c.type === "warning").map((c) => c.text.slice(0, 140)))];
check("console", "no console errors or uncaught exceptions", errors.length === 0, errors.map((e) => e.text.slice(0, 160)).join(" | ") || `${warnings.length} distinct warning(s)`);
if (warnings.length) info("console", "warnings", warnings.join(" | "));
check("network", "no failed local requests (excluding the deliberate 404 test)", failed.length === 0, JSON.stringify(failed).slice(0, 300) || "none");
check("network", "no external requests (all same-origin)", external.length === 0, external.join(", ") || `${allReq.length} requests, all ${base.origin} or data:/blob:`);

for (const p of pages) await p.close();
chrome.kill();
await sleep(500);
try { rmSync(udd, { recursive: true, force: true }); } catch { /* Chrome may still hold files */ }
const summary = { base: BASE, ranAt: new Date().toISOString(), pass: results.filter((r) => r.status === "PASS").length, fail: results.filter((r) => r.status === "FAIL").length, info: results.filter((r) => r.status === "INFO").length, results };
mkdirSync(path.join(ROOT, "qa", "reports"), { recursive: true });
writeFileSync(path.join(ROOT, "qa", "reports", "e2e-results.json"), JSON.stringify(summary, null, 2));
console.log(`\n${summary.pass} PASS, ${summary.fail} FAIL, ${summary.info} INFO`);
process.exit(summary.fail ? 1 : 0);
