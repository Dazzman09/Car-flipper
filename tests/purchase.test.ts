import { describe, expect, it } from "vitest";
import { CONFIG } from "@/engine/config";
import { ledgerBalances } from "@/engine/finance";
import { buyAtAsking, listed, newGame, reject, run } from "./helpers";

describe("purchasing", () => {
  it("transfers ownership, charges price and fee together", () => {
    const s0 = newGame(31);
    const car = listed(s0).find((c) => c.seller.currentAskCents < 900000)!;
    const s1 = buyAtAsking(s0, car.id);
    expect(s1.owned).toContain(car.id);
    expect(s1.marketplace).not.toContain(car.id);
    expect(s1.cars[car.id]!.status).toBe("owned");
    expect(s1.cash).toBe(s0.cash - car.seller.currentAskCents - CONFIG.acquisitionFee);
    expect(ledgerBalances(s1)).toBe(true);
  });

  it("cannot buy the same car twice", () => {
    const s0 = newGame(32);
    const car = listed(s0).find((c) => c.seller.currentAskCents < 900000)!;
    const s1 = buyAtAsking(s0, car.id);
    expect(reject(s1, { type: "buy", carId: car.id })).toMatch(/no longer available/);
  });

  it("enforces garage capacity", () => {
    let s = newGame(33);
    s = { ...s, cash: 10_000_000 };
    s.startingCash = 10_000_000;
    const cars = listed(s).slice(0, 3);
    s = buyAtAsking(s, cars[0]!.id);
    s = buyAtAsking(s, cars[1]!.id);
    s = run(s, { type: "makeOffer", carId: cars[2]!.id, amountCents: cars[2]!.seller.currentAskCents });
    expect(reject(s, { type: "buy", carId: cars[2]!.id })).toMatch(/garage is full/);
  });

  it("refuses purchases the player can't afford", () => {
    let s = newGame(34);
    const car = listed(s)[0]!;
    s = run(s, { type: "makeOffer", carId: car.id, amountCents: car.seller.currentAskCents > s.cash ? s.cash : car.seller.currentAskCents });
    const poor = { ...s, cash: 1000, startingCash: s.startingCash - (s.cash - 1000) };
    const err = reject(poor, { type: "buy", carId: car.id });
    expect(err).toMatch(/You need/);
  });

  it("consumes an action point and refuses when none remain", () => {
    let s = newGame(35);
    const car = listed(s).find((c) => c.seller.currentAskCents < 900000)!;
    s = run(s, { type: "makeOffer", carId: car.id, amountCents: car.seller.currentAskCents });
    const tired = { ...s, actionPoints: 0 };
    expect(reject(tired, { type: "buy", carId: car.id })).toMatch(/action points/);
  });
});
