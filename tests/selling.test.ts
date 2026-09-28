import { describe, expect, it } from "vitest";
import { ledgerBalances } from "@/engine/finance";
import { wholesaleEstimate, wholesalePayout } from "@/engine/selling";
import type { GameState } from "@/engine/state";
import { estimateResale } from "@/engine/valuation";
import { playerView, trueValueToday } from "@/engine/market";
import { advance, buyAtAsking, listed, newGame, reject, run } from "./helpers";

function ownedCar(seed: number): { s: GameState; carId: string } {
  let s = newGame(seed);
  const car = listed(s).find((c) => c.seller.currentAskCents < 1000000)!;
  s = buyAtAsking(s, car.id);
  return { s, carId: car.id };
}

function listAt(s: GameState, carId: string, factor = 0.95): GameState {
  const est = estimateResale(playerView(s, s.cars[carId]!));
  return run(s, {
    type: "listForSale",
    carId,
    askingCents: Math.round((est.likelyCents * factor) / 5000) * 5000,
    advertText: "Reliable daily driver, 120,000 km, service receipts, rego till March. Inspections and test drives welcome.",
    disclosedFaultIds: s.cars[carId]!.knowledge.confirmedFaults.filter((f) => !f.repaired).map((f) => f.faultId),
    disclosedModificationIds: [],
  });
}

function untilOffer(s: GameState, carId: string, maxDays = 12): GameState {
  for (let i = 0; i < maxDays; i++) {
    s = advance(s);
    if (Object.values(s.buyers).some((b) => b.carId === carId && b.status === "offered")) return s;
  }
  throw new Error("No offers arrived");
}

describe("selling", () => {
  it("completes a sale atomically and records the flip", () => {
    let { s, carId } = ownedCar(51);
    s = listAt(s, carId, 0.9);
    s = untilOffer(s, carId);
    const offers = Object.values(s.buyers).filter((b) => b.carId === carId && b.status === "offered");
    const best = offers.sort((a, b) => b.offerCents - a.offerCents)[0]!;
    const cashBefore = s.cash;
    s = run(s, { type: "acceptBuyerOffer", buyerId: best.id });
    expect(s.cash).toBe(cashBefore + best.offerCents);
    expect(s.owned).not.toContain(carId);
    expect(s.cars[carId]!.status).toBe("sold");
    expect(s.saleListings[carId]!.status).toBe("sold");
    expect(Object.values(s.buyers).filter((b) => b.carId === carId && b.status === "offered")).toHaveLength(0);
    const flip = s.flips.at(-1)!;
    expect(flip.carId).toBe(carId);
    expect(flip.profitCents).toBe(flip.saleCents - flip.totalCostCents);
    expect(ledgerBalances(s)).toBe(true);
    // Selling again, or accepting a competing offer, is impossible.
    expect(reject(s, { type: "acceptBuyerOffer", buyerId: best.id })).toMatch(/no longer open/);
    for (const other of offers.filter((o) => o.id !== best.id)) {
      expect(reject(s, { type: "acceptBuyerOffer", buyerId: other.id })).toMatch(/no longer open/);
    }
    expect(reject(s, { type: "sellToWholesaler", carId })).toMatch(/don't own/);
  });

  it("rejects expired offers", () => {
    let { s, carId } = ownedCar(52);
    s = listAt(s, carId, 0.9);
    s = untilOffer(s, carId);
    const offer = Object.values(s.buyers).find((b) => b.carId === carId && b.status === "offered")!;
    const stale = { ...s, day: offer.expiresDay + 1 };
    expect(reject(stale, { type: "acceptBuyerOffer", buyerId: offer.id })).toMatch(/expired/);
  });

  it("expires offers when days pass", () => {
    let { s, carId } = ownedCar(53);
    s = listAt(s, carId, 0.9);
    s = untilOffer(s, carId);
    const offer = Object.values(s.buyers).find((b) => b.carId === carId && b.status === "offered")!;
    s = advance(s, 3);
    expect(["expired", "invalidated"]).toContain(s.buyers[offer.id]?.status ?? "expired");
  });

  it("buyer offers are fixed for a given day (no reroll by reload)", () => {
    let { s, carId } = ownedCar(54);
    s = listAt(s, carId, 0.95);
    const a = advance(s);
    const b = advance(structuredClone(s));
    expect(a.buyers).toEqual(b.buyers);
  });

  it("withdrawing an advert cancels outstanding offers", () => {
    let { s, carId } = ownedCar(55);
    s = listAt(s, carId, 0.9);
    s = untilOffer(s, carId);
    s = run(s, { type: "withdrawListing", carId });
    expect(Object.values(s.buyers).some((b) => b.carId === carId && b.status === "offered")).toBe(false);
  });

  it("can't disclose faults you haven't confirmed or list a car you don't own", () => {
    const { s, carId } = ownedCar(56);
    const unknown = s.cars[carId]!.truth.faults.find(
      (f) => !s.cars[carId]!.knowledge.confirmedFaults.some((c) => c.faultId === f.id),
    );
    if (unknown) {
      expect(
        reject(s, { type: "listForSale", carId, askingCents: 500000, advertText: "x", disclosedFaultIds: [unknown.id], disclosedModificationIds: [] }),
      ).toMatch(/confirmed/);
    }
    expect(
      reject(s, { type: "listForSale", carId: s.marketplace[0]!, askingCents: 500000, advertText: "x", disclosedFaultIds: [], disclosedModificationIds: [] }),
    ).toMatch(/don't own/);
  });

  it("wholesale is an immediate exit; the pre-sale range uses only player knowledge", () => {
    const { s, carId } = ownedCar(57);
    const range = wholesaleEstimate(s, carId);
    const modified = structuredClone(s);
    modified.cars[carId]!.truth.faults = [];
    expect(wholesaleEstimate(modified, carId)).toEqual(range);
    const after = run(s, { type: "sellToWholesaler", carId });
    const payout = wholesalePayout(s, s.cars[carId]!);
    expect(after.cash).toBe(s.cash + payout);
    expect(payout).toBeLessThan(trueValueToday(s, s.cars[carId]!));
    expect(after.flips.at(-1)!.channel).toBe("wholesale");
    expect(after.owned).not.toContain(carId);
  });

  it("counter-offers: accepted within the buyer's limit, final answer after one counter", () => {
    let { s, carId } = ownedCar(58);
    s = listAt(s, carId, 1.0);
    s = untilOffer(s, carId, 20);
    const offer = Object.values(s.buyers).find((b) => b.carId === carId && b.status === "offered" && b.offerCents < s.saleListings[carId]!.askingCents);
    if (!offer) return;
    const r = run(s, { type: "counterBuyerOffer", buyerId: offer.id, amountCents: offer.offerCents + 5000 });
    const b = r.buyers[offer.id]!;
    expect(b.countered).toBe(true);
    if (b.status === "offered") {
      expect(reject(r, { type: "counterBuyerOffer", buyerId: offer.id, amountCents: offer.offerCents + 10000 })).toMatch(/final answer/);
    }
  });
});
