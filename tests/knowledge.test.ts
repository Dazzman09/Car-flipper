import { describe, expect, it } from "vitest";
import { deserialise, serialise } from "@/persistence/save";
import { estimateResale, publicView } from "@/engine/valuation";
import { playerView } from "@/engine/market";
import type { Car } from "@/engine/state";
import { findGame, listed, newGame, reject, run } from "./helpers";

describe("truth versus player knowledge", () => {
  it("estimates never depend on undiscovered faults", () => {
    const s = newGame(8);
    for (const car of listed(s)) {
      const clean: Car = structuredClone(car);
      clean.truth.faults = [];
      clean.truth.hiddenModifications = [];
      clean.truth.serviceHistory = "full";
      const wrecked: Car = structuredClone(car);
      wrecked.truth.faults = wrecked.truth.faults.map((f) => ({ ...f, severity: "moderate" as const }));
      wrecked.truth.serviceHistory = "none";
      expect(estimateResale(playerView(s, clean))).toEqual(estimateResale(playerView(s, car)));
      expect(estimateResale(playerView(s, wrecked))).toEqual(estimateResale(playerView(s, car)));
    }
  });

  it("the public view exposes no truth or seller reservation", () => {
    const car = listed(newGame(2))[0]!;
    const view = publicView(car, 1) as unknown as Record<string, unknown>;
    expect(view).not.toHaveProperty("truth");
    expect(view).not.toHaveProperty("seller");
    expect(JSON.stringify(view)).not.toContain("reservationCents");
    expect(JSON.stringify(view)).not.toContain("sellerKnows");
  });

  it("seller claims are stored as unverified claims, not facts", () => {
    const { state, car } = findGame((c) => c.knowledge.claims.some((cl) => cl.topic === "mechanical"));
    // Only faults the seller disclosed in the listing start out known.
    expect(car.knowledge.confirmedFaults.every((f) => f.source === "listing")).toBe(true);
    for (const f of car.knowledge.confirmedFaults) {
      expect(car.truth.faults.find((x) => x.id === f.faultId)!.sellerDisclosed).toBe(true);
    }
    const claim = car.knowledge.claims.find((c) => c.topic === "mechanical")!;
    expect(claim.status).toBe("unverified");
    expect(state.cars[car.id]!.knowledge.claims).toContainEqual(claim);
  });

  it("an inspection can't be repeated to reroll it", () => {
    const s0 = newGame(4);
    const car = listed(s0)[0]!;
    const s1 = run(s0, { type: "inspect", carId: car.id, method: "ppi" });
    expect(reject(s1, { type: "inspect", carId: car.id, method: "ppi" })).toMatch(/already/);
  });

  it("inspection outcomes survive a save/reload and match a fresh run", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const s0 = newGame(seed);
      const car = listed(s0)[0]!;
      const direct = run(s0, { type: "inspect", carId: car.id, method: "ppi" });
      const reloaded = deserialise(serialise(s0));
      const viaReload = run(reloaded, { type: "inspect", carId: car.id, method: "ppi" });
      expect(viaReload.cars[car.id]!.knowledge).toEqual(direct.cars[car.id]!.knowledge);
      const reloadedAfter = deserialise(serialise(direct));
      expect(reloadedAfter.cars[car.id]!.knowledge).toEqual(direct.cars[car.id]!.knowledge);
    }
  });

  it("different methods reveal different evidence", () => {
    const { state, car } = findGame((c) => c.truth.faults.some((f) => f.typeId === "engine-mounts"), 800);
    const s = run(run(state, { type: "inspect", carId: car.id, method: "testDrive" }), { type: "inspect", carId: car.id, method: "visual" });
    const k = s.cars[car.id]!.knowledge;
    // A test drive yields symptoms, never confirmed faults.
    expect(k.confirmedFaults.every((f) => f.source !== "testDrive")).toBe(true);
    // Engine mounts can't be seen on a visual inspection.
    expect(k.confirmedFaults.some((f) => f.typeId === "engine-mounts" && f.source === "visual")).toBe(false);
  });

  it("PPI charges once, costs an action point, and narrows the range", () => {
    const s0 = newGame(11);
    const car = listed(s0)[0]!;
    const before = estimateResale(playerView(s0, car));
    const s1 = run(s0, { type: "inspect", carId: car.id, method: "ppi" });
    expect(s1.cash).toBe(s0.cash - 25000);
    expect(s1.actionPoints).toBe(s0.actionPoints - 1);
    const after = estimateResale(playerView(s1, s1.cars[car.id]!));
    const width = (e: { likelyCents: number; lowCents: number }) => (e.likelyCents - e.lowCents) / e.likelyCents;
    expect(width(after)).toBeLessThan(width(before));
  });

  it("seller questions are answered once and never change the car", () => {
    const s0 = newGame(6);
    const car = listed(s0)[0]!;
    const s1 = run(s0, { type: "askQuestion", carId: car.id, question: "mechanical" });
    expect(s1.cars[car.id]!.truth).toEqual(car.truth);
    expect(reject(s1, { type: "askQuestion", carId: car.id, question: "mechanical" })).toMatch(/already/);
  });
});
