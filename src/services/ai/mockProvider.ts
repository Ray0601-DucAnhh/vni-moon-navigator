/** MOCK assistant provider - TEST MODE ONLY (enabled with ?mockai=1).
 *
 *  Purpose: verify the complete UI -> tool loop -> number guard -> "Data used"
 *  flow without any API key. It is NOT an AI: it picks tools with simple
 *  keyword rules, calls the SAME read-only tools the real model gets, and
 *  writes a templated answer from their outputs. The UI labels it clearly.
 *
 *  Deliberate guard probe: if the question contains "invent", the mock adds a
 *  number that is not in any tool output, so testers can confirm the number
 *  guard flags it. */

import { runTool, type ToolCallRecord, type ToolContext } from "./tools";
import type { ChatTurnResult } from "./client";

type AnyObj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function fmt(n: number, d = 2): string {
  return Number(n).toFixed(d);
}

function pct(f: number): string {
  return `${(f * 100).toFixed(1)}%`;
}

export async function runMockTurn(
  history: { role: "user" | "assistant"; text: string }[],
  ctx: ToolContext,
): Promise<ChatTurnResult> {
  const q = (history[history.length - 1]?.text ?? "").toLowerCase();
  const toolCalls: ToolCallRecord[] = [];
  const call = async (name: string, input: AnyObj) => {
    const output = await runTool(name, input, ctx);
    toolCalls.push({ name, input, output });
    return output as AnyObj;
  };
  // Simulated latency so loading states are visible.
  await new Promise((r) => setTimeout(r, 350));

  let text: string;
  if (/compare|vs|versus/.test(q)) {
    const out = await call("compare_sites", { window_days: 30 });
    if (out.error) {
      text = `Not available in this app's data: ${out.error}`;
    } else {
      const [a, b] = out.sites as AnyObj[];
      text =
        `[MOCK] Over the next ${out.windowDays} days from ${String(out.utc).slice(0, 16)} UTC, ` +
        `${a.name} is sunlit ${pct(a.window.sunlitFrac)} of the time (smooth-Moon reference ${pct(a.window.smoothSunlitFrac)}) ` +
        `and has Earth in geometric line of sight ${pct(a.window.earthFrac)}; ` +
        `${b.name} is sunlit ${pct(b.window.sunlitFrac)} (reference ${pct(b.window.smoothSunlitFrac)}) with Earth in sight ${pct(b.window.earthFrac)}. ` +
        `Longest dark spells: ${fmt(a.window.longestDarkH, 1)} h vs ${fmt(b.window.longestDarkH, 1)} h. ` +
        `Earth visibility here is geometric only - not a guarantee of a radio link.`;
    }
  } else if (/safe|best|approved|optimal/.test(q)) {
    text =
      "[MOCK] I can't judge landing safety or call a site best/approved - this app only computes Sun and Earth geometry over LOLA / SLDEM2015 terrain. I can compare those computed values if you like.";
  } else if (/depth|crater|temperature|radiation/.test(q)) {
    text = "[MOCK] Not available in this app's data - it contains Sun/Earth geometry and terrain horizons only.";
  } else {
    const out = await call("get_site_summary", {});
    if (out.error) {
      text = `Not available in this app's data: ${out.error}`;
    } else {
      const s = out.state as AnyObj;
      text =
        `[MOCK] At ${String(s.utc).slice(0, 16)} UTC at ${out.site.name}, the Sun is at ${fmt(s.sun.elDeg)} deg elevation ` +
        `against a terrain horizon of ${fmt(s.sun.horizonElDeg)} deg in that direction, so it is ${s.sun.sunlit ? "sunlit" : "not sunlit"}. ` +
        `Earth is at ${fmt(s.earth.elDeg)} deg (${s.earth.visible ? "in geometric line of sight" : "below the terrain horizon"}; geometric only, not a radio link). ` +
        (out.nextEvents?.sun ? `Next Sun ${out.nextEvents.sun.type}: ${String(out.nextEvents.sun.utc).slice(0, 16)} UTC. ` : "") +
        `Sources: ${(out.site.sourceIds as string[]).join(", ")}.`;
    }
  }
  if (/invent/.test(q)) text += " (Guard probe: the crater is 987.6 m deep.)";
  return { text, toolCalls, stopReason: "mock" };
}
