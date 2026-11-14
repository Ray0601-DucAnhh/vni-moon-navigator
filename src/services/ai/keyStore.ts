/** The user's API key lives ONLY in this module's closure for the current
 *  tab session, together with the chosen provider and model. It is never
 *  written to localStorage/sessionStorage/IndexedDB, cookies, URLs, our
 *  manifest, or any server; it is sent only to the chosen AI provider's own
 *  API host. Verified by the AI security checklist (qa/checklists/ai-safety.md). */

import type { ProviderId } from "./providers";

let key: string | null = null;
let provider: ProviderId = "anthropic";
let model: string | null = null;

export const keyStore = {
  set(k: string, p: ProviderId = "anthropic", m: string | null = null): void {
    key = k.trim() || null;
    provider = p;
    model = m?.trim() || null;
  },
  get(): string | null {
    return key;
  },
  has(): boolean {
    return key !== null;
  },
  provider(): ProviderId {
    return provider;
  },
  /** null = the provider's default model. */
  model(): string | null {
    return model;
  },
  forget(): void {
    key = null;
    model = null;
  },
};
