/** Browser-direct Anthropic client (BYOK). The official SDK's browser mode
 *  is explicitly opt-in (dangerouslyAllowBrowser); the key comes from
 *  keyStore (tab memory only) and is sent only to api.anthropic.com.
 *  Manual tool loop, max 6 rounds, non-streaming (answers are short). */

import Anthropic from "@anthropic-ai/sdk";
import { keyStore } from "./keyStore";
import { SYSTEM_PROMPT } from "./systemPrompt";
import { TOOL_DEFS, runTool, type ToolCallRecord, type ToolContext } from "./tools";

export const ASSISTANT_MODEL = "claude-opus-5-5";

export interface ChatTurnResult {
  text: string;
  toolCalls: ToolCallRecord[];
  stopReason: string | null;
}

export class AssistantError extends Error {
  constructor(
    message: string,
    public kind: "no-key" | "auth" | "rate" | "network" | "refusal" | "other",
  ) {
    super(message);
  }
}

type MsgParam = Anthropic.Beta.BetaMessageParam;

export async function runChatTurn(
  history: { role: "user" | "assistant"; text: string }[],
  ctx: ToolContext,
  signal?: AbortSignal,
): Promise<ChatTurnResult> {
  const apiKey = keyStore.get();
  if (!apiKey) throw new AssistantError("No API key set.", "no-key");

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  const messages: MsgParam[] = history.map((m) => ({ role: m.role, content: m.text }));
  const toolCalls: ToolCallRecord[] = [];

  try {
    for (let round = 0; round < 6; round++) {
      const resp = await client.beta.messages.create(
        {
          model: ASSISTANT_MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          output_config: { effort: "low" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          tools: TOOL_DEFS as Anthropic.Beta.BetaTool[],
          messages,
        },
        { signal },
      );

      if (resp.stop_reason === "refusal") {
        throw new AssistantError(
          "The model declined this request" +
            (resp.stop_details && "explanation" in resp.stop_details && resp.stop_details.explanation
              ? `: ${resp.stop_details.explanation}`
              : "."),
          "refusal",
        );
      }

      const toolUses = resp.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
      );
      if (resp.stop_reason !== "tool_use" || toolUses.length === 0) {
        const text = resp.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return { text, toolCalls, stopReason: resp.stop_reason };
      }

      messages.push({ role: "assistant", content: resp.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((tu) => {
        const input = (tu.input ?? {}) as Record<string, unknown>;
        const output = runTool(tu.name, input, ctx);
        toolCalls.push({ name: tu.name, input, output });
        return {
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(output),
        };
      });
      messages.push({ role: "user", content: results });
    }
    return {
      text: "I stopped after several tool rounds without a final answer - please rephrase or narrow the question.",
      toolCalls,
      stopReason: "max-rounds",
    };
  } catch (e) {
    if (e instanceof AssistantError) throw e;
    const err = e as { status?: number; name?: string; message?: string };
    if (err.status === 401 || err.status === 403) {
      throw new AssistantError("The provider rejected this API key (401). Check the key and try again.", "auth");
    }
    if (err.status === 429) {
      throw new AssistantError("Rate limited by the provider (429). Wait a moment and retry.", "rate");
    }
    if (err.name === "APIConnectionError" || /fetch|network|connection/i.test(err.message ?? "")) {
      throw new AssistantError("Could not reach api.anthropic.com - check your connection.", "network");
    }
    throw new AssistantError(err.message ?? "Unexpected assistant error.", "other");
  }
}
