import type { Cents } from "./money";
import { sum } from "./money";
import type { GameState } from "./state";
import { estimateResale } from "./valuation";
import { playerView } from "./market";

export interface FinanceSummary {
  cashCents: Cents;
  realisedProfitCents: Cents;
  inventoryCostCents: Cents;
  /** Cash plus the low end of the player's own estimates for owned cars. */
  liquidationEquityCents: Cents;
  /** Money spent on inspections of cars never bought. */
  scoutingCostCents: Cents;
  otherIncomeCents: Cents;
}

/** Money spent so far on a car (purchase, fees, inspections, workshop, holding). */
export function costBasisCents(state: GameState, carId: string): Cents {
  return -sum(state.ledger.filter((e) => e.carId === carId && e.amountCents < 0).map((e) => e.amountCents));
}

export function financeSummary(state: GameState): FinanceSummary {
  const realised = sum(state.flips.map((f) => f.profitCents));
  const inventoryCost = sum(state.owned.map((id) => costBasisCents(state, id)));
  let liquidation = state.cash;
  for (const id of state.owned) {
    const car = state.cars[id];
    if (car) liquidation += estimateResale(playerView(state, car)).lowCents;
  }
  const bought = new Set([...state.owned, ...state.flips.map((f) => f.carId)]);
  const scouting = -sum(state.ledger.filter((e) => e.kind === "inspection" && e.carId && !bought.has(e.carId)).map((e) => e.amountCents));
  const otherIncome = sum(state.ledger.filter((e) => e.kind === "side-job").map((e) => e.amountCents));
  return {
    cashCents: state.cash,
    realisedProfitCents: realised,
    inventoryCostCents: inventoryCost,
    liquidationEquityCents: liquidation,
    scoutingCostCents: scouting,
    otherIncomeCents: otherIncome,
  };
}

/** Invariant: cash equals starting cash plus every ledger entry. */
export function ledgerBalances(state: GameState): boolean {
  return state.startingCash + sum(state.ledger.map((e) => e.amountCents)) === state.cash;
}
