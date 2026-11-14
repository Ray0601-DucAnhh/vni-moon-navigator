/** The precomputed data window. Must match the generated ephemeris files
 *  (validated at load time by useSiteData, and by scripts/validate). */
export const EPH_WINDOW = {
  startMs: Date.UTC(2026, 10, 1, 0, 0, 0), // 2026-11-01T00:00Z
  endMs: Date.UTC(2027, 10, 1, 0, 0, 0), // 2027-11-01T00:00Z (last sample)
  startLabel: "2026-11-01",
  endLabel: "2027-11-01",
};
