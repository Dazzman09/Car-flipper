import { getVariant } from "./catalogue/variants";
import { carTitle } from "./generation";
import type { Cents } from "./money";
import type { Car, GameEvent, GameState, LedgerKind } from "./state";

/** A rule violation. Thrown inside a command; dispatch turns it into a rejected result. */
export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandError";
  }
}

export function fail(message: string): never {
  throw new CommandError(message);
}

export function nextId(state: GameState, prefix: string): string {
  const id = `${prefix}-${state.nextId}`;
  state.nextId += 1;
  return id;
}

export function requireCar(state: GameState, carId: string): Car {
  const car = state.cars[carId];
  if (!car) fail("That car no longer exists.");
  return car;
}

export function requireListedCar(state: GameState, carId: string): Car {
  const car = requireCar(state, carId);
  if (car.status !== "listed" || !state.marketplace.includes(carId)) fail("That listing is no longer available.");
  return car;
}

export function requireOwnedCar(state: GameState, carId: string): Car {
  const car = requireCar(state, carId);
  if (car.status !== "owned" || !state.owned.includes(carId)) fail("You don't own that car.");
  return car;
}

export function spendActionPoints(state: GameState, ap: number): void {
  if (ap <= 0) return;
  if (state.actionPoints < ap) {
    fail(`Not enough action points today (needs ${ap}, you have ${state.actionPoints}). Advance to the next day.`);
  }
  state.actionPoints -= ap;
}

/**
 * Record a cash movement. All cash changes go through here, so
 * `startingCash + Σ ledger = cash` always holds.
 */
export function post(state: GameState, kind: LedgerKind, amountCents: Cents, carId: string | null, memo: string): void {
  if (!Number.isSafeInteger(amountCents)) throw new Error(`Non-integer ledger amount ${amountCents}`);
  state.ledger.push({ id: nextId(state, "tx"), day: state.day, kind, amountCents, carId, memo });
  state.cash += amountCents;
}

export function requireCash(state: GameState, amountCents: Cents, what: string): void {
  if (state.cash < amountCents) fail(`You can't afford ${what}.`);
}

export function emit(state: GameState, tone: GameEvent["tone"], text: string, out: GameEvent[]): void {
  const event: GameEvent = { id: nextId(state, "ev"), day: state.day, tone, text };
  out.push(event);
  state.events.push(event);
  if (state.events.length > 120) state.events.splice(0, state.events.length - 120);
}

export function titleOf(car: Car): string {
  return carTitle(car, getVariant(car.variantId));
}

export function activeJobsFor(state: GameState, carId: string) {
  return state.jobs.filter((j) => j.carId === carId && j.status === "in-progress");
}
