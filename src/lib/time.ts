/** UTC time helpers. All internal times are epoch milliseconds (UTC). */

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/** Parse a Horizons calendar date like "2026-Nov-01 00:30" as UTC ms. */
export function parseHorizonsDate(s: string): number {
  const m = s.trim().match(/^(\d{4})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) throw new Error(`Unparseable Horizons date: "${s}"`);
  const mon = MONTHS[m[2]];
  if (mon === undefined) throw new Error(`Unknown month in: "${s}"`);
  return Date.UTC(+m[1], mon, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
}

/** Parse strict ISO-8601 UTC ("2026-11-01T00:00:00Z" or without seconds). */
export function parseIsoUtc(s: string): number {
  const t = Date.parse(s);
  if (!Number.isFinite(t)) throw new Error(`Unparseable ISO time: "${s}"`);
  return t;
}

export function toIsoUtc(ms: number, withSeconds = false): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  const base = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  return withSeconds ? `${base}:${p(d.getUTCSeconds())}Z` : `${base}Z`;
}

export function utcDateOnly(ms: number): string {
  return toIsoUtc(ms).slice(0, 10);
}

/** "2026-11-14 08:00 UTC" display form. */
export function fmtUtc(ms: number): string {
  return toIsoUtc(ms).replace("T", " ").replace("Z", " UTC");
}

/** Viewer-local display with zone label, e.g. "15:00 Nov 14 (GMT+7)". */
export function fmtLocal(ms: number): string {
  const d = new Date(ms);
  const fmt = new Intl.DateTimeFormat(undefined, {
    month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hour12: false, timeZoneName: "shortOffset",
  });
  return fmt.format(d);
}

/** Humanise a duration in ms: "3 d 4 h", "7 h 02 m", "12 m". */
export function fmtDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} m`;
  return `${m} m`;
}

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
