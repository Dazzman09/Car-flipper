import { CONFIG } from "./config";
import { emit, post, titleOf } from "./core";
import { churnMarketplace, refillMarketplace } from "./marketplace";
import { formatMoney } from "./money";
import { expireBuyerOffers, generateBuyers } from "./selling";
import type { GameEvent, GameState } from "./state";
import { completeDueJobs } from "./workshop";

/**
 * End the current day and start the next one. Order matters:
 *  1. Charge holding costs for the day that is ending (once per car per day).
 *  2. Marketplace churn for the closing day.
 *  3. Increment the day, reset action points.
 *  4. Complete due workshop jobs, lapse agreements, expire buyer offers.
 *  5. Refill the marketplace and generate buyer responses.
 */
export function advanceDay(state: GameState, events: GameEvent[]): void {
  const closingDay = state.day;
  let holding = 0;
  for (const carId of state.owned) {
    const car = state.cars[carId];
    if (!car) continue;
    post(state, "holding", -CONFIG.holdingCostPerCarPerDay, carId, `Holding cost day ${closingDay}: ${titleOf(car)}`);
    holding += CONFIG.holdingCostPerCarPerDay;
  }
  churnMarketplace(state, closingDay, events);

  state.day = closingDay + 1;
  state.actionPoints = CONFIG.actionPointsPerDay;
  state.stats.daysPlayed += 1;
  emit(state, "info", `Day ${state.day}.${holding > 0 ? ` Holding costs: ${formatMoney(holding)}.` : ""}`, events);

  completeDueJobs(state, events);
  for (const id of state.marketplace) {
    const s = state.cars[id]?.seller;
    if (!s) continue;
    if (s.status === "agreed" && s.agreed && s.agreed.expiresDay < state.day) {
      s.status = "open";
      s.agreed = null;
      emit(state, "bad", `Your agreed price on the ${titleOf(state.cars[id]!)} lapsed.`, events);
    }
    if (s.status === "open" && s.patience < s.maxPatience) s.patience += 1;
  }
  expireBuyerOffers(state);
  refillMarketplace(state);
  generateBuyers(state, events);
  if (state.cash < 0) emit(state, "bad", "You're overdrawn. Sell a car, take a side job or wholesale something.", events);
}
