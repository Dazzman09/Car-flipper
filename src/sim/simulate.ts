import { typicalRepairCents } from "@/engine/catalogue/faults";
import { dispatch, type Command } from "@/engine/commands";
import { financeSummary } from "@/engine/finance";
import { createNewGame } from "@/engine/newGame";
import type { GameState } from "@/engine/state";
import { estimateResale } from "@/engine/valuation";
import { playerView } from "@/engine/market";
import { quoteJob } from "@/engine/workshop";
import { roundTo } from "@/engine/money";

/**
 * Economy simulation. Each strategy is a bot that plays through the normal
 * command interface and reads only what a player could see: the public
 * listing, the seller's messages and its own knowledge. Bots never read
 * `truth` or seller reservations.
 */

export interface StrategyResult {
  strategy: string;
  seed: number;
  days: number;
  startNetWorth: number;
  endNetWorth: number;
  gain: number;
  flips: number;
  losingFlips: number;
  totalFlipProfit: number;
  purchaseTotal: number;
}

type Bot = (state: GameState) => GameState;

function tryCmd(state: GameState, cmd: Command): GameState {
  const r = dispatch(state, cmd);
  return r.ok ? r.state : state;
}

function netWorth(state: GameState): number {
  return financeSummary(state).liquidationEquityCents;
}

function listedCars(state: GameState) {
  return state.marketplace.map((id) => state.cars[id]!).filter((c) => c.status === "listed");
}

/** Sell side shared by the flipping bots. */
function manageSales(state: GameState, opts: { disclose: boolean; minAcceptRatio: number; wholesaleAfterDays: number }): GameState {
  let s = state;
  for (const carId of [...s.owned]) {
    const car = s.cars[carId]!;
    const listing = s.saleListings[carId];
    const busy = s.jobs.some((j) => j.carId === carId && j.status === "in-progress");
    if (busy) continue;
    const heldDays = s.day - (car.acquisition?.day ?? s.day);
    if (heldDays >= opts.wholesaleAfterDays) {
      s = tryCmd(s, { type: "sellToWholesaler", carId });
      continue;
    }
    if (!listing || listing.status !== "active") {
      const est = estimateResale(playerView(s, car));
      s = tryCmd(s, {
        type: "listForSale",
        carId,
        askingCents: roundTo(est.likelyCents * 1.02, 10000),
        advertText:
          "Well looked after, drives nicely. Odometer shows genuine km, service receipts in the glovebox, rego current. Inspections and test drives welcome.",
        disclosedFaultIds: opts.disclose ? car.knowledge.confirmedFaults.filter((f) => !f.repaired).map((f) => f.faultId) : [],
        disclosedModificationIds: opts.disclose ? car.knowledge.discoveredModifications : [],
      });
      continue;
    }
    const offers = Object.values(s.buyers)
      .filter((b) => b.carId === carId && b.status === "offered" && b.expiresDay >= s.day)
      .sort((a, b) => b.offerCents - a.offerCents);
    const best = offers[0];
    const listedFor = s.day - listing.listedDay;
    const threshold = listing.askingCents * Math.max(0.8, opts.minAcceptRatio - listedFor * 0.015);
    if (best && best.offerCents >= threshold) {
      s = tryCmd(s, { type: "acceptBuyerOffer", buyerId: best.id });
    } else if (listedFor > 0 && listedFor % 4 === 0) {
      s = tryCmd(s, { type: "updateAskingPrice", carId, askingCents: roundTo(listing.askingCents * 0.95, 5000) });
    }
  }
  return s;
}

/** Buys the listing with the best apparent margin at the asking price, without inspecting. */
const blindFlipper: Bot = (state) => {
  let s = manageSales(state, { disclose: true, minAcceptRatio: 0.92, wholesaleAfterDays: 20 });
  if (s.owned.length < s.garageSpaces) {
    const candidates = listedCars(s)
      .map((c) => ({ c, margin: estimateResale(playerView(s, c)).likelyCents - c.seller.currentAskCents }))
      .filter((x) => x.c.seller.currentAskCents + 20000 < s.cash)
      .sort((a, b) => b.margin - a.margin);
    const pick = candidates[0];
    if (pick) {
      s = tryCmd(s, { type: "makeOffer", carId: pick.c.id, amountCents: pick.c.seller.currentAskCents });
      s = tryCmd(s, { type: "buy", carId: pick.c.id });
    }
  }
  return tryCmd(s, { type: "advanceDay" });
};

/** Value a detail would add, from the public presentation score. */
function detailUpside(car: GameState["cars"][string], likely: number): number {
  const gain = Math.min(25, 95 - car.truth.presentation); // presentation is public (see PublicCarView)
  return Math.max(0, Math.round(likely * 0.003 * gain) - 15000);
}

/** Inspects, negotiates with evidence, repairs what pays, discloses honestly. */
const carefulFlipper: Bot = (state) => {
  let s = state;
  // Workshop: repair confirmed faults and detail where the benefit exceeds the cost.
  for (const carId of s.owned) {
    if (s.saleListings[carId]?.status === "active") continue;
    const car = s.cars[carId]!;
    for (const f of car.knowledge.confirmedFaults.filter((x) => !x.repaired)) {
      const q = quoteJob(s, carId, "repair", f.faultId);
      if (q.available && (q.resaleBenefitCents ?? 0) > q.costCents && q.cashAfterCents > 50000) {
        s = tryCmd(s, { type: "bookJob", carId, kind: "repair", faultId: f.faultId });
      }
    }
    for (const kind of ["detail", "service"] as const) {
      const q = quoteJob(s, carId, kind);
      if (q.available && (q.resaleBenefitCents ?? 0) > q.costCents * 1.2 && q.cashAfterCents > 50000) {
        s = tryCmd(s, { type: "bookJob", carId, kind });
      }
    }
  }
  s = manageSales(s, { disclose: true, minAcceptRatio: 0.95, wholesaleAfterDays: 24 });

  if (s.owned.length < s.garageSpaces) {
    // Screen fresh listings with the free inspections; pay for a PPI only on survivors.
    const ranked = listedCars(s)
      .filter((c) => c.seller.status === "open" && c.knowledge.inspections.length === 0 && c.seller.currentAskCents * 0.85 + 40000 < s.cash)
      .map((c) => {
        const likely = estimateResale(playerView(s, c)).likelyCents;
        return { c, margin: likely + detailUpside(c, likely) - c.seller.currentAskCents * 0.87 };
      })
      .filter((x) => x.margin > 0)
      .sort((a, b) => b.margin - a.margin);
    for (const { c } of ranked.slice(0, 2)) {
      if (s.actionPoints < 4) break;
      const id = c.id;
      s = tryCmd(s, { type: "inspect", carId: id, method: "visual" });
      s = tryCmd(s, { type: "inspect", carId: id, method: "testDrive" });
      const screened = estimateResale(playerView(s, s.cars[id]!));
      const upside = detailUpside(s.cars[id]!, screened.likelyCents);
      if (screened.likelyCents + upside - s.cars[id]!.seller.currentAskCents * 0.87 < 30000) continue;
      s = tryCmd(s, { type: "inspect", carId: id, method: "ppi" });
      s = tryCmd(s, { type: "askQuestion", carId: id, question: "reason" });
      for (const f of s.cars[id]!.knowledge.confirmedFaults) {
        s = tryCmd(s, { type: "presentEvidence", carId: id, faultId: f.faultId });
      }
      s = tryCmd(s, { type: "dialogue", carId: id, option: "cash-ready" });
      const est = estimateResale(playerView(s, s.cars[id]!));
      const repairs = s.cars[id]!.knowledge.confirmedFaults
        .filter((f) => !f.repaired)
        .reduce((a, f) => a + typicalRepairCents(f.typeId, f.severity), 0);
      // Buy only with room for costs and a margin.
      const walkAway = est.likelyCents + detailUpside(s.cars[id]!, est.likelyCents) - repairs * 0.2 - 45000;
      let offer = roundTo(s.cars[id]!.seller.currentAskCents * 0.85, 5000);
      for (let round = 0; round < 6; round++) {
        const seller = s.cars[id]?.seller;
        if (!seller || seller.status !== "open" || offer > walkAway) break;
        s = tryCmd(s, { type: "makeOffer", carId: id, amountCents: offer });
        const after = s.cars[id]!.seller;
        if (after.status !== "open") break;
        offer = roundTo(Math.min(after.currentAskCents, offer + (after.currentAskCents - offer) * 0.5), 5000);
      }
      const agreed = s.cars[id]?.seller.agreed;
      if (agreed && agreed.amountCents <= walkAway) {
        s = tryCmd(s, { type: "buy", carId: id });
        break;
      }
    }
  }
  return tryCmd(s, { type: "advanceDay" });
};

/** Buys at the seller's price and immediately wholesales. Should always lose money. */
const wholesaleArbitrage: Bot = (state) => {
  let s = state;
  for (const id of [...s.owned]) s = tryCmd(s, { type: "sellToWholesaler", carId: id });
  const cheap = listedCars(s)
    .filter((c) => c.seller.currentAskCents + 20000 < s.cash)
    .sort((a, b) => a.seller.currentAskCents - b.seller.currentAskCents)[0];
  if (cheap) {
    s = tryCmd(s, { type: "makeOffer", carId: cheap.id, amountCents: roundTo(cheap.seller.currentAskCents * 0.9, 5000) });
    if (s.cars[cheap.id]?.seller.status === "open") {
      s = tryCmd(s, { type: "makeOffer", carId: cheap.id, amountCents: s.cars[cheap.id]!.seller.currentAskCents });
    }
    s = tryCmd(s, { type: "buy", carId: cheap.id });
  }
  return tryCmd(s, { type: "advanceDay" });
};

/** Never trades; only works side jobs. The income floor. */
const sideJobsOnly: Bot = (state) => tryCmd(tryCmd(state, { type: "sideJob" }), { type: "advanceDay" });

/** Sells without disclosing known faults. Tests that dishonesty is punished. */
const dishonestFlipper: Bot = (state) => {
  let s = manageSales(state, { disclose: false, minAcceptRatio: 0.95, wholesaleAfterDays: 24 });
  if (s.owned.length < s.garageSpaces) {
    const c = listedCars(s)
      .filter((x) => x.seller.currentAskCents + 40000 < s.cash && x.seller.status === "open")
      .sort((a, b) => estimateResale(playerView(s, b)).likelyCents - b.seller.currentAskCents - (estimateResale(playerView(s, a)).likelyCents - a.seller.currentAskCents))[0];
    if (c) {
      s = tryCmd(s, { type: "inspect", carId: c.id, method: "ppi" });
      s = tryCmd(s, { type: "makeOffer", carId: c.id, amountCents: s.cars[c.id]!.seller.currentAskCents });
      s = tryCmd(s, { type: "buy", carId: c.id });
    }
  }
  return tryCmd(s, { type: "advanceDay" });
};

export const STRATEGIES: Record<string, Bot> = {
  careful: carefulFlipper,
  blind: blindFlipper,
  dishonest: dishonestFlipper,
  "wholesale-arbitrage": wholesaleArbitrage,
  "side-jobs-only": sideJobsOnly,
};

export function simulate(strategy: string, seed: number, days: number): StrategyResult & { finalState: GameState } {
  const bot = STRATEGIES[strategy];
  if (!bot) throw new Error(`Unknown strategy ${strategy}`);
  let s = createNewGame({ seed, imagePolicy: "allow-pending" });
  const start = netWorth(s);
  for (let d = 0; d < days; d++) s = bot(s);
  const end = netWorth(s);
  return {
    strategy,
    seed,
    days,
    startNetWorth: start,
    endNetWorth: end,
    gain: end - start,
    flips: s.flips.length,
    losingFlips: s.flips.filter((f) => f.profitCents < 0).length,
    totalFlipProfit: s.flips.reduce((a, f) => a + f.profitCents, 0),
    purchaseTotal: s.flips.reduce((a, f) => a + f.purchaseCents, 0),
    finalState: s,
  };
}

export interface StrategySummary {
  strategy: string;
  runs: number;
  meanGain: number;
  medianGain: number;
  worstGain: number;
  bestGain: number;
  meanFlips: number;
  losingFlipRate: number;
  meanProfitPerFlip: number;
  meanMarginOnPurchase: number;
  meanReputation: number;
}

export function summarise(strategy: string, seeds: readonly number[], days: number): StrategySummary {
  const results = seeds.map((seed) => simulate(strategy, seed, days));
  const gains = results.map((r) => r.gain).sort((a, b) => a - b);
  const flips = results.reduce((a, r) => a + r.flips, 0);
  const losing = results.reduce((a, r) => a + r.losingFlips, 0);
  const profit = results.reduce((a, r) => a + r.totalFlipProfit, 0);
  const purchases = results.reduce((a, r) => a + r.purchaseTotal, 0);
  return {
    strategy,
    runs: results.length,
    meanGain: Math.round(gains.reduce((a, b) => a + b, 0) / gains.length),
    medianGain: gains[Math.floor(gains.length / 2)]!,
    worstGain: gains[0]!,
    bestGain: gains[gains.length - 1]!,
    meanFlips: flips / results.length,
    losingFlipRate: flips ? losing / flips : 0,
    meanProfitPerFlip: flips ? Math.round(profit / flips) : 0,
    meanMarginOnPurchase: purchases ? profit / purchases : 0,
    meanReputation: results.reduce((a, r) => a + r.finalState.reputation, 0) / results.length,
  };
}
