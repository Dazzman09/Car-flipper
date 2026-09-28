import { dispatch, type Command } from "@/engine/commands";
import { createNewGame } from "@/engine/newGame";
import type { Car, GameState } from "@/engine/state";

export function newGame(seed = 12345): GameState {
  return createNewGame({ seed, imagePolicy: "allow-pending" });
}

/** Dispatch and assert success. */
export function run(state: GameState, cmd: Command): GameState {
  const result = dispatch(state, cmd);
  if (!result.ok) throw new Error(`Command ${cmd.type} rejected: ${result.error}`);
  return result.state;
}

/** Dispatch and return the rejection message (throws if the command succeeded). */
export function reject(state: GameState, cmd: Command): string {
  const result = dispatch(state, cmd);
  if (result.ok) throw new Error(`Expected ${cmd.type} to be rejected`);
  expectUnchanged(state, result.state);
  return result.error;
}

function expectUnchanged(a: GameState, b: GameState) {
  if (a !== b) throw new Error("Rejected command returned a different state object");
}

export function listed(state: GameState): Car[] {
  return state.marketplace.map((id) => state.cars[id]!);
}

export function cheapestListing(state: GameState): Car {
  return [...listed(state)].sort((a, b) => a.seller.currentAskCents - b.seller.currentAskCents)[0]!;
}

/** Agree the asking price and buy the car. */
export function buyAtAsking(state: GameState, carId: string): GameState {
  const car = state.cars[carId]!;
  let s = run(state, { type: "makeOffer", carId, amountCents: car.seller.currentAskCents });
  s = run(s, { type: "buy", carId });
  return s;
}

export function advance(state: GameState, days = 1): GameState {
  let s = state;
  for (let i = 0; i < days; i++) s = run(s, { type: "advanceDay" });
  return s;
}

/** Search seeds for a game whose marketplace contains a car matching the predicate. */
export function findGame(pred: (car: Car, state: GameState) => boolean, maxSeeds = 400): { state: GameState; car: Car } {
  for (let seed = 1; seed <= maxSeeds; seed++) {
    const state = newGame(seed);
    const car = listed(state).find((c) => pred(c, state));
    if (car) return { state, car };
  }
  throw new Error("No matching game found");
}
