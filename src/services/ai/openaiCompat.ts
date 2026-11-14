/** OpenAI-compatible chat client (Gemini, Groq, OpenRouter, Mistral), called
 *  directly from the browser with the user's own key. Same system prompt, same
 *  read-only tools and the same manual tool loop as the Anthropic client, so the
 *  number guard and "Data used" drawer work identically. Max 6 rounds. */

import { SYSTEM_PROMPT } from "./systemPrompt";
import { TOOL_DEFS, runTool, type ToolCallRecord, type ToolContext } from "./tools";
import type { ProviderInfo } from "./providers";
import { AssistantError, type ChatTurnResult } from "./errors";

type Json = Record<string, unknown>;

interface CompatToolCall {
  id?: string;
  type?: string;
  function: { name: string; arguments?: string };
}
interface CompatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: CompatToolCall[];
  tool_call_id?: string;
}

/** JSON-Schema subset every provider accepts: drop keywords some reject
 *  (Gemini refuses additionalProperties; empty "required" arrays are noise). */
export function sanitizeSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(sanitizeSchema);
  if (!s || typeof s !== "object") return s;
  const out: Json = {};
  for (const [k, v] of Object.entries(s as Json)) {
    if (k === "additionalProperties" || k === "strict") continue;
    if (k === "required" && Array.isArray(v) && v.length === 0) continue;
    out[k] = sanitizeSchema(v);
  }
  return out;
}

/** Some models fill optional arguments with null, and providers that validate
 *  tool calls server-side (e.g. Groq) then reject the call. Let every optional
 *  top-level property also accept null; nulls are dropped before the tool runs. */
export function allowNullOptionals(schema: unknown): unknown {
  const s = schema as { properties?: Record<string, Json>; required?: string[] };
  if (!s?.properties) return schema;
  const req = new Set(s.required ?? []);
  const props: Record<string, Json> = {};
  for (const [name, p] of Object.entries(s.properties)) {
    props[name] = !req.has(name) && typeof p.type === "string" ? { ...p, type: [p.type, "null"] } : p;
  }
  return { ...s, properties: props };
}

/** Gemini's schema dialect is stricter about type unions, so it keeps plain types. */
export function compatTools(providerId: ProviderInfo["id"] = "groq") {
  return TOOL_DEFS.map((t) => {
    const clean = sanitizeSchema(t.input_schema);
    return {
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: providerId === "gemini" ? clean : allowNullOptionals(clean) },
    };
  });
}

function parseArgs(raw: string | undefined): Json {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v as Json).filter(([, x]) => x !== null));
  } catch {
    return {};
  }
}

export async function runCompatTurn(
  history: { role: "user" | "assistant"; text: string }[],
  ctx: ToolContext,
  provider: ProviderInfo,
  apiKey: string,
  model: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatTurnResult> {
  const messages: CompatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.text })),
  ];
  const toolCalls: ToolCallRecord[] = [];
  const tools = compatTools(provider.id);

  for (let round = 0; round < 6; round++) {
    let resp: Response;
    try {
      resp = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, tools, tool_choice: "auto", max_tokens: 1024, temperature: 0.2 }),
        signal,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw new AssistantError(`Could not reach ${provider.host} - check your connection.`, "network");
    }

    if (!resp.ok) {
      let detail = "";
      try {
        type ErrBody = { error?: { message?: string } | string; message?: string; detail?: string };
        const raw = (await resp.json()) as ErrBody | ErrBody[];
        const body = Array.isArray(raw) ? (raw[0] ?? {}) : raw; // Gemini wraps errors in an array
        detail = typeof body.error === "string" ? body.error : (body.error?.message ?? body.message ?? body.detail ?? "");
      } catch {
        /* non-JSON error body */
      }
      // Google answers an invalid key with 400 "API key not valid".
      if (resp.status === 401 || resp.status === 403 || (resp.status === 400 && /api[ _-]?key/i.test(detail))) {
        throw new AssistantError(`${provider.label} rejected this API key (${resp.status}). Check the key and try again.`, "auth");
      }
      if (resp.status === 429) {
        throw new AssistantError(`Rate limited by ${provider.label} (429) - free tiers have low limits. Wait a moment and retry.`, "rate");
      }
      throw new AssistantError(
        `${provider.label} returned an error (${resp.status})${detail ? `: ${detail.slice(0, 240)}` : ""}. If it mentions the model or tools, try another model that supports tool calling.`,
        "other",
      );
    }

    const data = (await resp.json()) as { choices?: { message?: CompatMessage; finish_reason?: string }[] };
    const choice = data.choices?.[0];
    const msg = choice?.message;
    if (!msg) throw new AssistantError(`${provider.label} returned no answer.`, "other");

    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) {
      return { text: (msg.content ?? "").trim(), toolCalls, stopReason: choice?.finish_reason ?? null };
    }

    const withIds = calls.map((c, i) => ({ ...c, id: c.id || `call_${round}_${i}`, type: "function" }));
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: withIds });
    for (const c of withIds) {
      const input = parseArgs(c.function.arguments);
      const output = await runTool(c.function.name, input, ctx);
      toolCalls.push({ name: c.function.name, input, output });
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(output) });
    }
  }
  return {
    text: "I stopped after several tool rounds without a final answer - please rephrase or narrow the question.",
    toolCalls,
    stopReason: "max-rounds",
  };
}
