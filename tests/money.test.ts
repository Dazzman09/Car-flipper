import { describe, expect, it } from "vitest";
import { dollars, formatMoney, formatSigned, parseDollars, roundTo, scale } from "@/engine/money";

describe("money", () => {
  it("converts dollars to integer cents", () => {
    expect(dollars(6200)).toBe(620000);
    expect(dollars(0.1 + 0.2)).toBe(30);
  });
  it("parses user input", () => {
    expect(parseDollars("$6,200")).toBe(620000);
    expect(parseDollars("6200.5")).toBe(620050);
    expect(parseDollars("abc")).toBeNull();
    expect(parseDollars("-5")).toBeNull();
  });
  it("formats AUD", () => {
    expect(formatMoney(104000)).toBe("$1,040");
    expect(formatSigned(-25000)).toBe("−$250");
    expect(formatSigned(104000)).toBe("+$1,040");
  });
  it("keeps integers when scaling and rounding", () => {
    expect(Number.isInteger(scale(123457, 0.937))).toBe(true);
    expect(roundTo(123457, 5000)).toBe(125000);
  });
  it("reproduces the plan's worked profit example", () => {
    const costs = [6200, 100, 250, 600, 150, 60].map(dollars);
    const total = costs.reduce((a, b) => a + b, 0);
    expect(total).toBe(dollars(7360));
    expect(dollars(8400) - total).toBe(dollars(1040));
  });
});
