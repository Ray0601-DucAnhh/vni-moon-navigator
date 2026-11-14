/** Number guard: every numeric token in an assistant answer must be traceable
 *  to this turn's tool outputs (or be trivially derived from them), otherwise
 *  it is flagged in the UI as "not from app data". Deterministic, app-side.
 *
 *  Allowed matches for a token x:
 *  - a number from any tool result, compared at x's displayed precision;
 *  - |a - b| or a +/- b of two tool numbers (differences, e.g. durations);
 *  - a ratio a/b expressed as a percentage (0..100), at x's precision;
 *  - components of ISO dates/times present in tool results;
 *  - small counting integers 0..12 and the common angles 90/180/270/360.
 */

export interface GuardResult {
  segments: { text: string; flagged: boolean }[];
  flaggedCount: number;
  totalNumbers: number;
}

// Digits glued to a preceding letter are part of an identifier (SLDEM2015,
// DE421, source ids like S39), not quantities, so they are not checked.
const NUM_RE = /(?<![A-Za-z_\d.,])-?\d+(?:[.,]\d+)?/g;

/** Recursively collect numbers and date components from a JSON-like value. */
export function collectNumbers(value: unknown, into: Set<number>): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    into.add(value);
    into.add(Math.round(value * 100) / 100);
    if (Math.abs(value) <= 1.000001) into.add(Math.round(value * 1000) / 10); // fraction -> %
    return;
  }
  if (typeof value === "string") {
    // ISO timestamps: expose their components and compact forms.
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (iso) {
      into.add(+iso[1]);
      into.add(+iso[2]);
      into.add(+iso[3]);
      if (iso[4]) {
        into.add(+iso[4]);
        into.add(+iso[5]);
        into.add(+(iso[4] + "." + iso[5]));
        into.add(+(iso[4] + iso[5])); // "0830" style
      }
    } else {
      for (const m of value.match(NUM_RE) ?? []) into.add(Number(m.replace(",", ".")));
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectNumbers(v, into);
    return;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectNumbers(v, into);
  }
}

function decimalsOf(token: string): number {
  const i = token.search(/[.,]/);
  return i < 0 ? 0 : token.length - i - 1;
}

function matches(x: number, decimals: number, pool: number[]): boolean {
  const tol = 0.5 * 10 ** -decimals + 1e-9;
  for (const p of pool) {
    if (Math.abs(p - x) <= tol) return true;
    if (Math.abs(Math.abs(p) - Math.abs(x)) <= tol) return true;
  }
  return false;
}

export function guardAnswer(answer: string, toolOutputs: unknown[], userText = ""): GuardResult {
  // Tool-derived numbers (the only source of pairwise differences).
  const toolSet = new Set<number>();
  for (const out of toolOutputs) collectNumbers(out, toolSet);
  const toolPool = [...toolSet].filter((v) => Number.isFinite(v));
  const derived: number[] = [];
  const capped = toolPool.slice(0, 150);
  for (let i = 0; i < capped.length; i++) {
    for (let j = i + 1; j < capped.length; j++) {
      derived.push(Math.abs(capped[i] - capped[j]));
    }
  }
  // Direct matches may also come from the user's own question and a small
  // set of counting/compass constants - but these never combine pairwise.
  const base = new Set<number>(toolPool);
  collectNumbers(userText, base);
  for (let i = 0; i <= 12; i++) base.add(i);
  for (const a of [15, 24, 30, 45, 60, 90, 100, 180, 270, 360]) base.add(a);
  const all = [...base].concat(derived);

  const segments: { text: string; flagged: boolean }[] = [];
  let flaggedCount = 0;
  let totalNumbers = 0;
  let last = 0;
  for (const m of answer.matchAll(NUM_RE)) {
    const tok = m[0];
    const idx = m.index ?? 0;
    if (idx > last) segments.push({ text: answer.slice(last, idx), flagged: false });
    const x = Number(tok.replace(",", "."));
    totalNumbers++;
    const ok = matches(x, Math.min(decimalsOf(tok), 4), all);
    if (!ok) flaggedCount++;
    segments.push({ text: tok, flagged: !ok });
    last = idx + tok.length;
  }
  if (last < answer.length) segments.push({ text: answer.slice(last), flagged: false });
  return { segments, flaggedCount, totalNumbers };
}
