import { describe, expect, it } from "vitest";
import { add, compare, multiply, rational, subtract } from "../src/rational";

describe("rational arithmetic", () => {
  it("normalizes values and signs", () => {
    expect(rational(6, -8)).toEqual({ numerator: -3, denominator: 4 });
  });

  it("performs exact tuplet arithmetic", () => {
    expect(add(rational(1, 3), rational(2, 3))).toEqual(rational(1));
    expect(multiply(rational(3, 2), rational(2, 3))).toEqual(rational(1));
    expect(subtract(rational(1), rational(3, 4))).toEqual(rational(1, 4));
    expect(compare(rational(2, 3), rational(3, 4))).toBeLessThan(0);
  });

  it("rejects invalid denominators", () => {
    expect(() => rational(1, 0)).toThrow(RangeError);
  });
});
