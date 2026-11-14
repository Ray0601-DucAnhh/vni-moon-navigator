/** Display formatting helpers. Science values stay numeric until here. */

export function fmtDeg(v: number, decimals = 1): string {
  return `${v.toFixed(decimals)}°`;
}

export function fmtLatLon(latDeg: number, lonDeg: number): string {
  const la = `${Math.abs(latDeg).toFixed(4)}° ${latDeg >= 0 ? "N" : "S"}`;
  const lo = `${Math.abs(lonDeg).toFixed(4)}° ${lonDeg >= 0 ? "E" : "W"}`;
  return `${la}, ${lo}`;
}

export function fmtPct(frac: number, decimals = 1): string {
  return `${(frac * 100).toFixed(decimals)}%`;
}

export function fmtMeters(v: number | null): string {
  return v === null ? "—" : `${Math.round(v).toLocaleString("en-US")} m`;
}

export function fmtHours(h: number): string {
  if (h >= 48) return `${(h / 24).toFixed(1)} d`;
  return `${h.toFixed(1)} h`;
}

export function azCompass(azDeg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(((azDeg % 360) / 22.5)) % 16];
}
