import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compatTools, runCompatTurn, sanitizeSchema } from "../src/services/ai/openaiCompat";
import { getProvider, PROVIDERS } from "../src/services/ai/providers";
import type { ToolContext } from "../src/services/ai/tools";

const root = path.resolve(__dirname, "..");
const sites = JSON.parse(readFileSync(path.join(root, "public/data/sites.json"), "utf8")).sites;
const ctx: ToolContext = {
  sites,
  regions: [],
  sources: [],
  loaded: {},
  selectedSiteId: "im2",
  utcMs: Date.parse("2026-12-03T06:00:00Z"),
  ensure: () => Promise.reject(new Error("not needed")),
};

function fakeFetch(replies: { status?: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = replies.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("OpenAI-compatible providers", () => {
  it("every provider uses https and a host inside its base URL", () => {
    for (const p of PROVIDERS) {
      expect(p.baseUrl.startsWith("https://")).toBe(true);
      expect(new URL(p.baseUrl).host).toBe(p.host);
    }
  });

  it("every provider host is allowed by the deployed Content-Security-Policy", () => {
    const csp = readFileSync(path.join(root, "vercel.json"), "utf8");
    for (const p of PROVIDERS) expect(csp).toContain(`https://${p.host}`);
  });

  it("tool schemas drop keywords some providers reject", () => {
    const s = sanitizeSchema({ type: "object", properties: {}, required: [], additionalProperties: false }) as Record<string, unknown>;
    expect(s).toEqual({ type: "object", properties: {} });
    const tools = compatTools();
    expect(tools.length).toBeGreaterThan(4);
    expect(JSON.stringify(tools)).not.toContain("additionalProperties");
    expect(tools[0].type).toBe("function");
  });

  it("runs the tool loop: tool call -> local tool -> final answer", async () => {
    const { impl, calls } = fakeFetch([
      { body: { choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "list_sites", arguments: "{}" } }] } }] } },
      { body: { choices: [{ finish_reason: "stop", message: { role: "assistant", content: "There are 14 analysed sites." } }] } },
    ]);
    const r = await runCompatTurn([{ role: "user", text: "Which sites?" }], ctx, getProvider("groq"), "test-key", "some-model", undefined, impl);
    expect(r.text).toBe("There are 14 analysed sites.");
    expect(r.toolCalls.map((t) => t.name)).toEqual(["list_sites"]);
    expect(calls[0].url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const second = JSON.parse(String(calls[1].init.body));
    expect(second.messages[0].role).toBe("system");
    expect(second.messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "c1" });
    expect(second.model).toBe("some-model");
  });

  it("maps 401 to an auth error and 429 to a rate error", async () => {
    const a = fakeFetch([{ status: 401, body: { error: { message: "bad key" } } }]);
    await expect(runCompatTurn([{ role: "user", text: "hi" }], ctx, getProvider("gemini"), "k", "m", undefined, a.impl)).rejects.toMatchObject({ kind: "auth" });
    const b = fakeFetch([{ status: 429, body: { error: "slow down" } }]);
    await expect(runCompatTurn([{ role: "user", text: "hi" }], ctx, getProvider("openrouter"), "k", "m", undefined, b.impl)).rejects.toMatchObject({ kind: "rate" });
  });

  it("recognises Gemini's array-wrapped 400 'valid API key' error as a key problem", async () => {
    const g = fakeFetch([{ status: 400, body: [{ error: { code: 400, message: "Please pass a valid API key", status: "INVALID_ARGUMENT" } }] }]);
    await expect(runCompatTurn([{ role: "user", text: "hi" }], ctx, getProvider("gemini"), "k", "m", undefined, g.impl)).rejects.toMatchObject({ kind: "auth" });
    const other = fakeFetch([{ status: 400, body: [{ error: { message: "Function calling is not enabled for this model" } }] }]);
    await expect(runCompatTurn([{ role: "user", text: "hi" }], ctx, getProvider("gemini"), "k", "m", undefined, other.impl)).rejects.toMatchObject({
      kind: "other",
      message: expect.stringContaining("Function calling is not enabled"),
    });
  });

  it("tolerates malformed tool arguments and missing call ids", async () => {
    const { impl } = fakeFetch([
      { body: { choices: [{ message: { role: "assistant", content: "", tool_calls: [{ function: { name: "list_sites", arguments: "{not json" } }] } }] } },
      { body: { choices: [{ message: { role: "assistant", content: "ok" } }] } },
    ]);
    const r = await runCompatTurn([{ role: "user", text: "x" }], ctx, getProvider("mistral"), "k", "m", undefined, impl);
    expect(r.text).toBe("ok");
    expect(r.toolCalls[0].input).toEqual({});
  });
});
