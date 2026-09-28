import { describe, expect, it } from "vitest";
import { createRng, rngFor, rollFor } from "@/engine/rng";

describe("rng", () => {
  it("is deterministic for the same seed and key", () => {
    const a = rngFor(7, "car", "car-1");
    const b = rngFor(7, "car", "car-1");
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
    expect(rollFor(7, "x", 1)).toBe(rollFor(7, "x", 1));
    expect(rollFor(7, "x", 1)).not.toBe(rollFor(7, "x", 2));
  });
  it("produces values in range", () => {
    const r = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
    }
  });
});
