import type { ToolCallRecord } from "./tools";

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
