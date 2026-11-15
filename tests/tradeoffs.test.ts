import { describe, expect, it } from "vitest";
import { paretoFront, rankStability, weightedScores, type SiteMetrics } from "../src/services/science/planning";

const m = (id: string, sunlitFrac: number, earthFrac: number, longestWindowH: number, longestDarkH: number, horizonRmsDeg: number): SiteMetrics =>
  ({ id, sunlitFrac, earthFrac, longestWindowH, longestDarkH, horizonRmsDeg });
const A = m("a", 0.5, 1, 300, 360, 0.1);
const B = m("b", 0.4, 0.9, 200, 400, 0.2); // dominated by A on every criterion
const C = m("c", 0.6, 0, 0, 350, 0.05); // trades Earth for Sun

describe("trade-offs", () => {
  it("Pareto front drops dominated sites", () => {
    expect(paretoFront([A, B, C]).sort()).toEqual(["a", "c"]);
  });
  it("weights decide the score (no built-in ranking)", () => {
    const sunOnly = weightedScores([A, B, C], { sunlitFrac: 1 });
    const earthOnly = weightedScores([A, B, C], { earthFrac: 1 });
    expect(sunOnly.c).toBeGreaterThan(sunOnly.a);
    expect(earthOnly.a).toBeGreaterThan(earthOnly.c);
  });
  it("rank stability shares sum to 1, are reproducible, and a dominated site never wins", () => {
    const r1 = rankStability([A, B, C], 500, 42);
    const r2 = rankStability([A, B, C], 500, 42);
    expect(r1).toEqual(r2);
    expect(Object.values(r1).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9);
    expect(r1.b).toBe(0);
  });
});
