import { describe, expect, it } from "vitest";
import { dispatch } from "@/engine/commands";
import { findGame, listed, newGame, reject, run, advance } from "./helpers";

describe("negotiation", () => {
  it("accepts any offer at or above the reservation, at no more than the asking price", () => {
    const s = newGame(21);
    for (const car of listed(s)) {
      const res = car.seller.reservationCents;
      const accepted = run(s, { type: "makeOffer", carId: car.id, amountCents: res });
      expect(accepted.cars[car.id]!.seller.status).toBe("agreed");
      expect(accepted.cars[car.id]!.seller.agreed!.amountCents).toBe(Math.min(res, car.seller.currentAskCents));
      const over = run(s, { type: "makeOffer", carId: car.id, amountCents: Math.min(s.cash, car.seller.currentAskCents + 100000) });
      if (car.seller.currentAskCents + 100000 <= s.cash) {
        expect(over.cars[car.id]!.seller.agreed!.amountCents).toBe(car.seller.currentAskCents);
      }
    }
  });

  it("counters never rise and never go below the reservation", () => {
    for (let seed = 1; seed <= 30; seed++) {
      let s = newGame(seed);
      const car = listed(s)[0]!;
      let offer = Math.round(car.seller.reservationCents * 0.8);
      let lastAsk = car.seller.currentAskCents;
      for (let round = 0; round < 10; round++) {
        const r = dispatch(s, { type: "makeOffer", carId: car.id, amountCents: offer });
        if (!r.ok) break;
        s = r.state;
        const seller = s.cars[car.id]!.seller;
        if (seller.status !== "open") break;
        expect(seller.currentAskCents).toBeLessThanOrEqual(lastAsk);
        expect(seller.currentAskCents).toBeGreaterThanOrEqual(seller.reservationCents);
        lastAsk = seller.currentAskCents;
        offer += 10000;
      }
    }
  });

  it("walks away when patience runs out", () => {
    let s = newGame(5);
    const car = listed(s)[0]!;
    for (let i = 0; i < 20 && s.cars[car.id]!.seller.status === "open"; i++) {
      s = run(s, { type: "makeOffer", carId: car.id, amountCents: 50000 });
    }
    expect(s.cars[car.id]!.seller.status).toBe("walked-away");
    expect(reject(s, { type: "makeOffer", carId: car.id, amountCents: car.seller.currentAskCents })).toMatch(/stopped replying/);
  });

  it("a confirmed fault lowers the price once only", () => {
    const { state, car } = findGame(
      (c) => c.truth.faults.some((f) => f.typeId === "panel-damage" || f.typeId === "worn-tyres"),
    );
    let s = run(state, { type: "inspect", carId: car.id, method: "ppi" });
    const confirmed = s.cars[car.id]!.knowledge.confirmedFaults.find((f) => f.source === "ppi")!;
    expect(confirmed).toBeDefined();
    const before = s.cars[car.id]!.seller;
    s = run(s, { type: "presentEvidence", carId: car.id, faultId: confirmed.faultId });
    const after = s.cars[car.id]!.seller;
    expect(after.reservationCents).toBeLessThan(before.reservationCents);
    expect(after.currentAskCents).toBeLessThan(before.currentAskCents);
    expect(reject(s, { type: "presentEvidence", carId: car.id, faultId: confirmed.faultId })).toMatch(/already raised/);
  });

  it("can't present a fault you haven't confirmed", () => {
    const { state, car } = findGame((c) => c.truth.faults.length > 0);
    expect(reject(state, { type: "presentEvidence", carId: car.id, faultId: car.truth.faults[0]!.id })).toMatch(/haven't confirmed/);
  });

  it("requires an agreed price before buying and lapses it after its window", () => {
    let s = newGame(9);
    const car = listed(s).find((c) => c.seller.currentAskCents <= s.cash - 10000)!;
    expect(reject(s, { type: "buy", carId: car.id })).toMatch(/Agree a price/);
    s = run(s, { type: "makeOffer", carId: car.id, amountCents: car.seller.currentAskCents });
    expect(reject(s, { type: "makeOffer", carId: car.id, amountCents: 100000 })).toMatch(/already have an agreed price/);
    s = advance(s, 2);
    if (s.marketplace.includes(car.id)) {
      expect(s.cars[car.id]!.seller.status).toBe("open");
      expect(reject(s, { type: "buy", carId: car.id })).toMatch(/Agree a price/);
    }
  });

  it("the cash-ready line can only be used once", () => {
    const s0 = newGame(10);
    const car = listed(s0)[0]!;
    const s1 = run(s0, { type: "dialogue", carId: car.id, option: "cash-ready" });
    expect(reject(s1, { type: "dialogue", carId: car.id, option: "cash-ready" })).toMatch(/already/);
  });
});
