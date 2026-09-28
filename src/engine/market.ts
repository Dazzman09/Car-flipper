import { getVariant, type Segment } from "./catalogue/variants";
import { rollFor } from "./rng";
import type { Car, GameState, PublicCarView } from "./state";
import { publicView, trueValueCents } from "./valuation";

/** Maximum weekly swing of a segment's prices either side of normal. */
export const MARKET_AMPLITUDE = 0.07;

function weekNoise(worldSeed: number, segment: Segment, week: number): number {
  return rollFor(worldSeed, "market", segment, week) * 2 - 1;
}

/**
 * Price index for a segment on a day (1 = normal). A smoothed weekly random
 * walk: public information, shown to the player as market conditions.
 */
export function marketIndex(worldSeed: number, segment: Segment, day: number): number {
  const week = Math.floor((day - 1) / 7);
  const t = ((day - 1) % 7) / 7;
  const level = (w: number) => 0.6 * weekNoise(worldSeed, segment, w) + 0.4 * weekNoise(worldSeed, segment, w - 1);
  const value = level(week) * (1 - t) + level(week + 1) * t;
  return Math.round((1 + MARKET_AMPLITUDE * value) * 1000) / 1000;
}

export function indexFor(state: Pick<GameState, "worldSeed" | "day">, car: Pick<Car, "variantId">): number {
  return marketIndex(state.worldSeed, getVariant(car.variantId).segment, state.day);
}

/** What the player can see of a car today. */
export function playerView(state: Pick<GameState, "worldSeed" | "day">, car: Car): PublicCarView {
  return publicView(car, indexFor(state, car));
}

/** Engine-internal: the car's actual value today. */
export function trueValueToday(state: Pick<GameState, "worldSeed" | "day">, car: Car): number {
  return trueValueCents(car, indexFor(state, car));
}
