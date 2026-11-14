/** The user's API key lives ONLY in this module's closure for the current
 *  tab session. It is never written to localStorage/sessionStorage/IndexedDB,
 *  cookies, URLs, our manifest, or any server; it is sent only to the AI
 *  provider by the official SDK. Verified by the AI security checklist
 *  (qa/checklists/ai-safety.md). */

let key: string | null = null;

export const keyStore = {
  set(k: string): void {
    key = k.trim() || null;
  },
  get(): string | null {
    return key;
  },
  has(): boolean {
    return key !== null;
  },
  forget(): void {
    key = null;
  },
};
