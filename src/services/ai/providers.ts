/** AI providers the user can bring their own key for. Every endpoint below was
 *  checked to accept direct browser calls (CORS preflight, 2026-11-15), so no
 *  VNI server is involved and the key stays in this tab. The list is fixed on
 *  purpose: vercel.json's Content-Security-Policy allows exactly these hosts.
 *  Default models were taken from each provider's docs / model list on
 *  2026-11-15; free-tier model names change, so the model field is editable. */

export type ProviderId = "anthropic" | "gemini" | "groq" | "openrouter" | "mistral";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  /** "anthropic" uses the official Anthropic SDK; the rest share one OpenAI-compatible client. */
  kind: "anthropic" | "openai-compat";
  /** Base URL of the OpenAI-compatible API (chat/completions is appended). */
  baseUrl: string;
  host: string;
  defaultModel: string;
  /** Model is fixed for Anthropic (the verified configuration). */
  modelEditable: boolean;
  cost: string;
  keyUrl: string;
  keyPlaceholder: string;
  modelsUrl?: string;
  note?: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic Claude",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    host: "api.anthropic.com",
    defaultModel: "claude-opus-5-5",
    modelEditable: false,
    cost: "Paid (pay-as-you-go API credits)",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-...",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    kind: "openai-compat",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    host: "generativelanguage.googleapis.com",
    defaultModel: "gemini-3.8-flash",
    modelEditable: true,
    cost: "Free tier available (rate-limited)",
    keyUrl: "https://aistudio.google.com/apikey",
    keyPlaceholder: "AIza...",
    modelsUrl: "https://ai.google.dev/gemini-api/docs/models",
    note: "On free tiers the provider may use your prompts to improve its products - don't type personal information.",
  },
  {
    id: "groq",
    label: "Groq",
    kind: "openai-compat",
    baseUrl: "https://api.groq.com/openai/v1",
    host: "api.groq.com",
    defaultModel: "openai/gpt-oss-120b",
    modelEditable: true,
    cost: "Free tier available (rate-limited)",
    keyUrl: "https://console.groq.com/keys",
    keyPlaceholder: "gsk_...",
    modelsUrl: "https://console.groq.com/docs/tool-use",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai-compat",
    baseUrl: "https://openrouter.ai/api/v1",
    host: "openrouter.ai",
    defaultModel: "nvidia/nemotron-3-ultra-550b-a55b:free",
    modelEditable: true,
    cost: "Free models (names ending in :free) and paid models",
    keyUrl: "https://openrouter.ai/settings/keys",
    keyPlaceholder: "sk-or-...",
    modelsUrl: "https://openrouter.ai/models?max_price=0&supported_parameters=tools",
    note: "Free models change often and may log prompts. Pick one that supports tools.",
  },
  {
    id: "mistral",
    label: "Mistral",
    kind: "openai-compat",
    baseUrl: "https://api.mistral.ai/v1",
    host: "api.mistral.ai",
    defaultModel: "mistral-small-latest",
    modelEditable: true,
    cost: "Free experiment tier available (rate-limited)",
    keyUrl: "https://console.mistral.ai/api-keys",
    keyPlaceholder: "Mistral API key",
    modelsUrl: "https://docs.mistral.ai/capabilities/function_calling/",
  },
];

export function getProvider(id: ProviderId): ProviderInfo {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}
