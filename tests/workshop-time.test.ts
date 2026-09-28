import { describe, expect, it } from "vitest";
import { CONFIG } from "@/engine/config";
import { ledgerBalances } from "@/engine/finance";
import { quoteJob } from "@/engine/workshop";
import { advance, buyAtAsking, findGame, listed, newGame, reject, run } from "./helpers";
import type { GameState } from "@/engine/state";

function ownCarWithConfirmedFault(): { s: GameState; carId: string; faultId: string } {
  const { state, car } = findGame(
    (c, st) => c.seller.currentAskCents + 30000 < st.cash && c.truth.faults.some((f) => f.typeId === "panel-damage"),
    800,
  );
  let s = run(state, { type: "inspect", carId: car.id, method: "visual" });
  const confirmed = s.cars[car.id]!.knowledge.confirmedFaults[0];
  if (!confirmed) throw new Error("visual inspection found nothing");
  s = buyAtAsking(s, car.id);
  return { s, carId: car.id, faultId: confirmed.faultId };
}

describe("workshop", () => {
  it("quotes cost, completion day, benefit and cash remaining", () => {
    const { s, carId, faultId } = ownCarWithConfirmedFault();
    const q = quoteJob(s, carId, "repair", faultId);
    const actual = s.cars[carId]!.truth.faults.find((f) => f.id === faultId)!;
    expect(q.costCents).toBe(actual.repairCents);
    expect(q.completionDay).toBeGreaterThan(s.day);
    expect(q.cashAfterCents).toBe(s.cash - q.costCents);
    expect(q.resaleBenefitCents).toBeGreaterThan(0);
  });

  it("charges once at booking and fixes the fault exactly once on completion", () => {
    let { s, carId, faultId } = ownCarWithConfirmedFault();
    const cashBefore = s.cash;
    const q = quoteJob(s, carId, "repair", faultId);
    s = run(s, { type: "bookJob", carId, kind: "repair", faultId });
    expect(s.cash).toBe(cashBefore - q.costCents);
    expect(reject(s, { type: "bookJob", carId, kind: "repair", faultId })).toMatch(/Already booked/);
    const repairCharges = () => s.ledger.filter((e) => e.kind === "repair" && e.carId === carId).length;
    for (let d = 0; d < 6; d++) {
      s = advance(s);
      expect(repairCharges()).toBe(1);
    }
    const car = s.cars[carId]!;
    expect(car.truth.faults.find((f) => f.id === faultId)!.repaired).toBe(true);
    expect(car.knowledge.confirmedFaults.find((f) => f.faultId === faultId)!.repaired).toBe(true);
    expect(s.jobs.filter((j) => j.carId === carId && j.status === "completed")).toHaveLength(1);
    expect(reject(s, { type: "bookJob", carId, kind: "repair", faultId })).toMatch(/Already repaired/);
    expect(ledgerBalances(s)).toBe(true);
  });

  it("can't repair a fault that hasn't been confirmed", () => {
    const { state, car } = findGame((c, st) => c.seller.currentAskCents + 30000 < st.cash && c.truth.faults.length > 0);
    const s = buyAtAsking(state, car.id);
    const unconfirmed = car.truth.faults.find((f) => !s.cars[car.id]!.knowledge.confirmedFaults.some((c) => c.faultId === f.id));
    if (unconfirmed) expect(reject(s, { type: "bookJob", carId: car.id, kind: "repair", faultId: unconfirmed.id })).toMatch(/confirmed/);
  });

  it("detailing improves presentation but never fixes faults; servicing can't repair a gearbox", () => {
    const { state, car } = findGame((c, st) => c.seller.currentAskCents + 60000 < st.cash && c.truth.faults.length > 0);
    let s = buyAtAsking(state, car.id);
    const faultsBefore = structuredClone(s.cars[car.id]!.truth.faults);
    const pres = s.cars[car.id]!.truth.presentation;
    s = run(s, { type: "bookJob", carId: car.id, kind: "detail" });
    s = run(s, { type: "bookJob", carId: car.id, kind: "service" });
    s = advance(s, 2);
    expect(s.cars[car.id]!.truth.presentation).toBe(Math.min(CONFIG.detail.maxPresentation, pres + CONFIG.detail.presentationGain));
    expect(s.cars[car.id]!.truth.faults).toEqual(faultsBefore);
    expect(reject(s, { type: "bookJob", carId: car.id, kind: "detail" })).toMatch(/Already detailed/);
  });

  it("diagnosis confirms faults the next day", () => {
    const { state, car } = findGame((c, st) => c.seller.currentAskCents + 30000 < st.cash && c.truth.faults.length >= 2);
    let s = buyAtAsking(state, car.id);
    s = run(s, { type: "bookJob", carId: car.id, kind: "diagnosis" });
    expect(s.cars[car.id]!.knowledge.inspections.some((i) => i.method === "diagnosis")).toBe(false);
    s = advance(s);
    const k = s.cars[car.id]!.knowledge;
    expect(k.inspections.some((i) => i.method === "diagnosis")).toBe(true);
    expect(k.confirmedFaults.length).toBeGreaterThanOrEqual(1);
    expect(k.serviceEvidence).not.toBe("unknown");
  });
});

describe("time", () => {
  it("charges holding costs exactly once per owned car per day", () => {
    let s = newGame(44);
    const car = listed(s).find((c) => c.seller.currentAskCents < 1000000)!;
    s = buyAtAsking(s, car.id);
    for (let d = 1; d <= 4; d++) {
      s = advance(s);
      const holding = s.ledger.filter((e) => e.kind === "holding" && e.carId === car.id);
      expect(holding).toHaveLength(d);
      expect(new Set(holding.map((e) => e.day)).size).toBe(d);
    }
    expect(ledgerBalances(s)).toBe(true);
  });

  it("resets action points each day and keeps days sequential", () => {
    let s = newGame(45);
    s = run(s, { type: "inspect", carId: s.marketplace[0]!, method: "visual" });
    expect(s.actionPoints).toBe(3);
    s = advance(s);
    expect(s.day).toBe(2);
    expect(s.actionPoints).toBe(CONFIG.actionPointsPerDay);
  });

  it("side jobs pay for remaining action points", () => {
    const s0 = newGame(46);
    const s1 = run(s0, { type: "sideJob" });
    expect(s1.cash).toBe(s0.cash + 4 * CONFIG.sideJob.payPerAp);
    expect(s1.actionPoints).toBe(0);
    expect(reject(s1, { type: "sideJob" })).toMatch(/at least/);
  });
});
