import { describe, expect, it } from "vitest";
import { summarise } from "@/sim/simulate";

const SEEDS = [101, 102, 103, 104, 105, 106, 107, 108];
const DAYS = 30;

describe("economy simulation", () => {
  const careful = summarise("careful", SEEDS, DAYS);
  const blind = summarise("blind", SEEDS, DAYS);
  const dishonest = summarise("dishonest", SEEDS, DAYS);
  const arbitrage = summarise("wholesale-arbitrage", SEEDS, DAYS);
  const sideJobs = summarise("side-jobs-only", SEEDS, DAYS);

  it("rewards inspecting, negotiating and adding value", () => {
    expect(careful.meanGain).toBeGreaterThan(0);
    expect(careful.meanFlips).toBeGreaterThan(3);
    expect(careful.meanProfitPerFlip).toBeGreaterThan(0);
  });

  it("flipping well beats the side-job income floor", () => {
    expect(careful.meanGain).toBeGreaterThan(sideJobs.meanGain);
    expect(sideJobs.meanGain).toBeGreaterThan(0);
  });

  it("buying blind at the asking price is not a winning strategy", () => {
    expect(blind.meanGain).toBeLessThan(careful.meanGain);
    expect(blind.losingFlipRate).toBeGreaterThan(careful.losingFlipRate);
    expect(blind.meanProfitPerFlip).toBeLessThan(0);
  });

  it("buying to wholesale immediately always loses", () => {
    expect(arbitrage.meanProfitPerFlip).toBeLessThan(0);
    expect(arbitrage.losingFlipRate).toBeGreaterThan(0.9);
  });

  it("hiding known faults costs reputation and money", () => {
    expect(dishonest.meanReputation).toBeLessThan(0);
    expect(dishonest.meanGain).toBeLessThan(careful.meanGain);
  });

  it("no strategy earns an implausible margin", () => {
    for (const s of [careful, blind, dishonest, arbitrage]) {
      expect(s.meanMarginOnPurchase).toBeLessThan(0.35);
    }
  });
});
