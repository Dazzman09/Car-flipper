import { CONFIG } from "./config";
import { emit, fail, post } from "./core";
import { formatMoney } from "./money";
import type { GameEvent, GameState } from "./state";

export interface Milestone {
  id: string;
  label: string;
  done: boolean;
  progress: string;
}

export function completedPrivateFlips(state: GameState): number {
  return state.flips.length;
}

export function garageUpgradeStatus(state: GameState): { available: boolean; reason: string | null } {
  const g = CONFIG.garageUpgrade;
  if (state.garageSpaces >= CONFIG.maxGarageSpaces) return { available: false, reason: "Your garage is at full size." };
  if (state.flips.length < g.minFlips) return { available: false, reason: `Complete ${g.minFlips} flips (${state.flips.length}/${g.minFlips}).` };
  if (state.reputation < g.minReputation) return { available: false, reason: `Reach reputation ${g.minReputation} (now ${state.reputation}).` };
  if (state.cash < g.cost) return { available: false, reason: `Costs ${formatMoney(g.cost)}.` };
  return { available: true, reason: null };
}

export function upgradeGarage(state: GameState, events: GameEvent[]): void {
  const status = garageUpgradeStatus(state);
  if (!status.available) fail(status.reason ?? "Upgrade unavailable.");
  post(state, "garage-upgrade", -CONFIG.garageUpgrade.cost, null, "Rented a third garage space");
  state.garageSpaces += 1;
  emit(state, "good", `Garage upgraded: you now have ${state.garageSpaces} spaces.`, events);
}

/** Unlock premium stock once the player has proven themselves. Idempotent. */
export function checkUnlocks(state: GameState, events: GameEvent[]): void {
  const p = CONFIG.premiumStock;
  if (!state.premiumUnlocked && state.flips.length >= p.minFlips && state.reputation >= p.minReputation) {
    state.premiumUnlocked = true;
    emit(state, "good", "Word is getting around: sellers are now offering you utes, SUVs and sports cars.", events);
  }
}

export function milestones(state: GameState): Milestone[] {
  const g = CONFIG.garageUpgrade;
  const p = CONFIG.premiumStock;
  const profitable = state.flips.filter((f) => f.profitCents > 0).length;
  return [
    { id: "first-flip", label: "Complete your first flip", done: state.flips.length >= 1, progress: `${Math.min(1, state.flips.length)}/1` },
    { id: "first-profit", label: "Make a profit on a flip", done: profitable >= 1, progress: `${Math.min(1, profitable)}/1` },
    {
      id: "garage",
      label: `Unlock a third garage space (${g.minFlips} flips, reputation ${g.minReputation})`,
      done: state.garageSpaces >= 3,
      progress: `${state.flips.length}/${g.minFlips} flips · rep ${state.reputation}/${g.minReputation}`,
    },
    {
      id: "premium",
      label: `Unlock premium stock (${p.minFlips} flips, reputation ${p.minReputation})`,
      done: state.premiumUnlocked,
      progress: `${state.flips.length}/${p.minFlips} flips · rep ${state.reputation}/${p.minReputation}`,
    },
  ];
}

/** A paid day's work at a mate's detailing business: guaranteed income for a bad patch. */
export function doSideJob(state: GameState, events: GameEvent[]): void {
  const ap = state.actionPoints;
  if (ap < CONFIG.sideJob.minAp) fail(`A side job needs at least ${CONFIG.sideJob.minAp} action points.`);
  const pay = ap * CONFIG.sideJob.payPerAp;
  state.actionPoints = 0;
  post(state, "side-job", pay, null, `Side job (${ap} action points)`);
  state.stats.sideJobs += 1;
  emit(state, "good", `You spent the rest of the day detailing cars for a mate and earned ${formatMoney(pay)}.`, events);
}
