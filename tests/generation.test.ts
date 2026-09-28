import { describe, expect, it } from "vitest";
import { getImageSet, IMAGE_SETS } from "@/engine/catalogue/images";
import { getVariant, VARIANTS } from "@/engine/catalogue/variants";
import { CONFIG } from "@/engine/config";
import { generateCar } from "@/engine/generation";
import { advance, buyAtAsking, cheapestListing, listed, newGame } from "./helpers";

describe("marketplace generation", () => {
  it("starts a career with the configured economy", () => {
    const s = newGame(1);
    expect(s.cash).toBe(CONFIG.startingCash);
    expect(s.garageSpaces).toBe(2);
    expect(s.actionPoints).toBe(4);
    expect(s.marketplace).toHaveLength(CONFIG.marketplaceSize);
  });

  it("keeps enough affordable stock on every day", () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = newGame(seed);
      for (let d = 0; d < 10; d++) {
        const affordable = listed(s).filter((c) => c.listing.askingCents <= CONFIG.affordableThreshold);
        expect(affordable.length).toBeGreaterThanOrEqual(CONFIG.minAffordableListings);
        expect(s.marketplace.length).toBe(CONFIG.marketplaceSize);
        s = advance(s);
      }
    }
  });

  it("every generated car's visible configuration matches its image set", () => {
    const ctx = { worldSeed: 42, day: 1, premiumUnlocked: true, imagePolicy: "allow-pending" as const };
    for (let i = 0; i < 3000; i++) {
      const car = generateCar(ctx, `car-${i}`);
      const set = getImageSet(car.imageSetId);
      const variant = getVariant(car.variantId);
      expect(set.variantId).toBe(car.variantId);
      expect(car.year).toBeGreaterThanOrEqual(set.compatibleYears[0]);
      expect(car.year).toBeLessThanOrEqual(set.compatibleYears[1]);
      expect(car.year).toBeGreaterThanOrEqual(variant.productionYears[0]);
      expect(car.year).toBeLessThanOrEqual(variant.productionYears[1]);
      // Hidden modifications must never be visible ones (visible mods come from the photo only).
      for (const m of car.truth.hiddenModifications) expect(set.visibleModifications).not.toContain(m);
    }
  });

  it("does not spawn premium variants until unlocked", () => {
    for (let seed = 1; seed <= 10; seed++) {
      for (const c of listed(newGame(seed))) expect(getVariant(c.variantId).tier).toBe(1);
    }
  });

  it("can generate every catalogue variant", () => {
    const ctx = { worldSeed: 5, day: 1, premiumUnlocked: true, imagePolicy: "allow-pending" as const };
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(generateCar(ctx, `c${i}`).variantId);
    expect(seen.size).toBe(VARIANTS.length);
    expect(IMAGE_SETS.length).toBeGreaterThanOrEqual(VARIANTS.length);
  });

  it("generates the same car for the same seed and id", () => {
    const ctx = { worldSeed: 9, day: 1, premiumUnlocked: false, imagePolicy: "allow-pending" as const };
    expect(generateCar(ctx, "car-7")).toEqual(generateCar(ctx, "car-7"));
  });

  it("fixes faults when the car enters the world; buying adds none", () => {
    let s = newGame(3);
    const car = cheapestListing(s);
    const before = structuredClone(car.truth);
    s = buyAtAsking(s, car.id);
    expect(s.cars[car.id]!.truth).toEqual(before);
    s = advance(s, 3);
    expect(s.cars[car.id]!.truth.faults).toEqual(before.faults);
  });

  it("refuses to spawn anything when no image set is eligible", () => {
    const ctx = { worldSeed: 1, day: 1, premiumUnlocked: false, imagePolicy: "verified-only" as const };
    expect(() => generateCar(ctx, "car-1")).toThrow(/No spawnable variants/);
  });
});
