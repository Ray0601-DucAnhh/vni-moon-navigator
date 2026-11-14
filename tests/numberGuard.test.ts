import { describe, expect, it } from "vitest";
import { guardAnswer } from "../src/features/assistant/numberGuard";

const toolOut = [
  {
    siteId: "im2",
    utc: "2026-11-14T08:30:00Z",
    sun: { elDeg: 3.21, azDeg: 156.4, horizonElDeg: 1.05, visibleFraction: 1 },
    earth: { elDeg: 4.9, azDeg: 341.2, horizonElDeg: -0.8, visible: true },
    window30d: { sunlitFrac: 0.439, earthFrac: 0.801, longestDarkH: 171.5 },
  },
];

describe("number guard", () => {
  it("passes numbers taken from tool outputs at displayed precision", () => {
    const r = guardAnswer(
      "The Sun is at 3.21 deg (azimuth 156.4) above a 1.05 deg terrain horizon; Earth sits at 4.9 deg. Over 30 days the site is sunlit 43.9% of the time and sees Earth 80.1%.",
      toolOut,
    );
    expect(r.flaggedCount).toBe(0);
    expect(r.totalNumbers).toBeGreaterThan(5);
  });

  it("passes rounded values and simple differences", () => {
    const r = guardAnswer("Clearance is about 2.2 deg (3.21 minus 1.05); roughly 3 deg up.", toolOut);
    expect(r.flaggedCount).toBe(0);
  });

  it("flags invented values", () => {
    const r = guardAnswer("The crater is 21 km wide and 4.2 km deep.", toolOut);
    expect(r.flaggedCount).toBeGreaterThanOrEqual(2);
  });

  it("passes date components from ISO strings", () => {
    const r = guardAnswer("At 08:30 UTC on 2026-11-14 the Sun is up.", toolOut);
    expect(r.flaggedCount).toBe(0);
  });

  it("segments reassemble the exact answer text", () => {
    const text = "Sun 3.21 deg; invented 999.9 m.";
    const r = guardAnswer(text, toolOut);
    expect(r.segments.map((s) => s.text).join("")).toBe(text);
    expect(r.segments.filter((s) => s.flagged).map((s) => s.text)).toEqual(["999.9"]);
  });
});
