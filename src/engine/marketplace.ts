import { CONFIG } from "./config";
import { emit, nextId, titleOf } from "./core";
import { eligibleVariants, generateCar, type GenerationContext } from "./generation";
import { rollFor } from "./rng";
import type { GameEvent, GameState } from "./state";
import { clamp } from "./valuation";
import { trueValueToday } from "./market";

function context(state: GameState): GenerationContext {
  return {
    worldSeed: state.worldSeed,
    day: state.day,
    premiumUnlocked: state.premiumUnlocked,
    imagePolicy: state.imagePolicy,
  };
}

function affordableCount(state: GameState): number {
  return state.marketplace.filter((id) => (state.cars[id]?.listing.askingCents ?? Infinity) <= CONFIG.affordableThreshold)
    .length;
}

/**
 * Top the marketplace up to its target size. While there are too few
 * affordable listings, new cars are drawn from the cheaper half of the
 * catalogue and rejected if their asking price is out of reach.
 */
export function refillMarketplace(state: GameState): number {
  const ctx = context(state);
  const all = eligibleVariants(ctx);
  if (all.length === 0) return 0;
  const tier1 = eligibleVariants(ctx, 1);
  const cheap = [...tier1].sort((a, b) => a.value.refCents - b.value.refCents).slice(0, Math.max(1, Math.ceil(tier1.length / 2)));
  let added = 0;
  let guard = 0;
  while (state.marketplace.length < CONFIG.marketplaceSize && guard < 200) {
    guard++;
    const needAffordable = affordableCount(state) < CONFIG.minAffordableListings;
    const id = nextId(state, "car");
    const car = generateCar(ctx, id, needAffordable && cheap.length ? { variants: cheap } : {});
    if (needAffordable && car.listing.askingCents > CONFIG.affordableThreshold) continue;
    state.cars[id] = car;
    state.marketplace.push(id);
    added++;
  }
  return added;
}

/**
 * Daily marketplace churn for the day that just ended: expire listings and let
 * simulated competitors buy good deals. A car the player has an agreed price
 * on is held for them until the agreement expires.
 */
export function churnMarketplace(state: GameState, closingDay: number, events: GameEvent[]): void {
  const remaining: string[] = [];
  for (const id of state.marketplace) {
    const car = state.cars[id];
    if (!car) continue;
    const seller = car.seller;
    const held = seller.status === "agreed" && seller.agreed !== null && seller.agreed.expiresDay >= closingDay + 1;
    if (!held && closingDay >= car.listing.expiresDay) {
      car.status = "gone";
      car.goneReason = "expired";
      continue;
    }
    if (!held) {
      const value = trueValueToday({ worldSeed: state.worldSeed, day: closingDay }, car);
      const dealness = clamp((value - seller.currentAskCents) / value, 0, 0.5);
      const p = clamp(CONFIG.competitorBaseSaleChance + CONFIG.competitorDealBonus * dealness * 4, 0, 0.6);
      if (rollFor(state.worldSeed, "competitor", id, closingDay) < p) {
        car.status = "gone";
        car.goneReason = "sold-to-competitor";
        const investigated = car.knowledge.inspections.length > 0 || seller.offers.length > 0;
        if (investigated) emit(state, "bad", `Another buyer snapped up the ${titleOf(car)} you were looking at.`, events);
        continue;
      }
    }
    remaining.push(id);
  }
  state.marketplace = remaining;
  pruneGoneCars(state);
}

/** Forget cars that left the market and never became part of the player's history. */
function pruneGoneCars(state: GameState): void {
  for (const [id, car] of Object.entries(state.cars)) {
    if (car.status === "gone" && !state.marketplace.includes(id)) {
      delete state.cars[id];
    }
  }
}
