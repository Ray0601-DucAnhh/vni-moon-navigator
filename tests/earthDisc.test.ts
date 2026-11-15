import { describe, expect, it } from "vitest";
import { EARTH_ANGULAR_RADIUS_DEG, earthVisibleFraction } from "../src/services/science/core";

describe("Earth disc visible fraction", () => {
  it("angular radius is ~0.95 deg", () => expect(EARTH_ANGULAR_RADIUS_DEG).toBeCloseTo(0.9496, 3));
  it("centre on the horizon -> half the disc", () => expect(earthVisibleFraction(0)).toBeCloseTo(0.5, 6));
  it("1 deg above -> whole disc; 1 deg below -> none", () => {
    expect(earthVisibleFraction(1)).toBe(1);
    expect(earthVisibleFraction(-1)).toBe(0);
  });
  it("increases monotonically with clearance", () => {
    expect(earthVisibleFraction(0.3)).toBeGreaterThan(earthVisibleFraction(0.1));
  });
});
