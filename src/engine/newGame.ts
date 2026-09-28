import type { ImagePolicy } from "./catalogue/images";
import { CONFIG } from "./config";
import { emit } from "./core";
import { refillMarketplace } from "./marketplace";
import { SCHEMA_VERSION, type GameState } from "./state";

export interface NewGameOptions {
  seed?: number;
  imagePolicy?: ImagePolicy;
}

export function randomSeed(): number {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0]! >>> 0;
  }
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}

export function createNewGame(options: NewGameOptions = {}): GameState {
  const seed = options.seed ?? randomSeed();
  const state: GameState = {
    schemaVersion: SCHEMA_VERSION,
    careerId: `career-${seed.toString(36)}`,
    worldSeed: seed,
    imagePolicy: options.imagePolicy ?? "allow-pending",
    day: 1,
    actionPoints: CONFIG.actionPointsPerDay,
    cash: CONFIG.startingCash,
    startingCash: CONFIG.startingCash,
    garageSpaces: CONFIG.startingGarageSpaces,
    reputation: CONFIG.startingReputation,
    premiumUnlocked: false,
    nextId: 1,
    cars: {},
    marketplace: [],
    owned: [],
    jobs: [],
    saleListings: {},
    buyers: {},
    ledger: [],
    flips: [],
    events: [],
    stats: { inspections: 0, offersMade: 0, sideJobs: 0, daysPlayed: 0 },
    tutorial: { dismissed: false },
  };
  refillMarketplace(state);
  emit(state, "info", "Welcome to the trade. You have $15,000, a two-car garage and a phone full of listings.", []);
  return state;
}
