import { getFaultType } from "./catalogue/faults";
import { getImageSet } from "./catalogue/images";
import { getVariant } from "./catalogue/variants";
import { CONFIG } from "./config";
import { activeJobsFor, emit, fail, nextId, post, requireOwnedCar, spendActionPoints, titleOf } from "./core";
import { formatMoney, roundTo, type Cents } from "./money";
import { checkUnlocks } from "./progression";
import { rngFor, rollFor } from "./rng";
import type { Buyer, Car, FlipRecord, GameEvent, GameState, SaleListing } from "./state";
import { clamp, estimateResale, faultDiscountCents, marketValueCents, type ValuationView } from "./valuation";
import { indexFor, playerView, trueValueToday } from "./market";

const BUYER_NAMES = [
  "Kylie", "Matt", "Anh", "Jack", "Olivia", "Hassan", "Emma", "Luke", "Zara", "Connor", "Isla", "Wei",
  "Mitch", "Grace", "Tyson", "Ruby", "Arjun", "Holly", "Declan", "Maya",
];

export const MAX_ADVERT_LENGTH = 1500;
export const REPUTATION_MIN = -20;
export const REPUTATION_MAX = 25;

/** Advert quality from 0 to 1. Rewards useful, specific adverts. */
export function advertQuality(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  let q = 0.2 + 0.35 * Math.min(1, words / 35);
  if (/\bkm\b|kilomet|odo/i.test(text)) q += 0.1;
  if (/service|logbook|receipt/i.test(text)) q += 0.1;
  if (/rego|registration|roadworthy/i.test(text)) q += 0.1;
  if (/inspect|test drive|welcome|viewing/i.test(text)) q += 0.1;
  if (words > 250) q -= 0.1;
  return clamp(Math.round(q * 100) / 100, 0, 1);
}

/** What a buyer can see from the advert: the car, the disclosures and any paperwork. */
export function advertView(car: Car, listing: SaleListing, marketIndex: number): ValuationView {
  const disclosed = car.knowledge.confirmedFaults.filter((f) => !f.repaired && listing.disclosedFaultIds.includes(f.faultId));
  return {
    variant: getVariant(car.variantId),
    year: car.year,
    odometerKm: car.odometerKm,
    presentation: car.truth.presentation,
    serviceEvidence: car.knowledge.serviceEvidence,
    modifications: [...getImageSet(car.imageSetId).visibleModifications, ...listing.disclosedModificationIds],
    knownFaults: disclosed.map((f) => ({ typeId: f.typeId, severity: f.severity })),
    marketIndex,
  };
}

export interface CreateListingInput {
  carId: string;
  askingCents: Cents;
  advertText: string;
  disclosedFaultIds: string[];
  disclosedModificationIds: string[];
}

export function createSaleListing(state: GameState, input: CreateListingInput, events: GameEvent[]): void {
  const car = requireOwnedCar(state, input.carId);
  if (activeJobsFor(state, car.id).length > 0) fail("Wait for the workshop to finish before advertising.");
  if (state.saleListings[car.id]?.status === "active") fail("That car is already advertised.");
  if (!Number.isSafeInteger(input.askingCents) || input.askingCents <= 0) fail("Enter a valid asking price.");
  if (input.advertText.length > MAX_ADVERT_LENGTH) fail("Advert is too long.");
  const confirmed = new Set(car.knowledge.confirmedFaults.filter((f) => !f.repaired).map((f) => f.faultId));
  for (const f of input.disclosedFaultIds) if (!confirmed.has(f)) fail("You can only disclose faults you've confirmed and not repaired.");
  const knownMods = new Set(car.knowledge.discoveredModifications);
  for (const m of input.disclosedModificationIds) if (!knownMods.has(m)) fail("You can only disclose modifications you know about.");
  spendActionPoints(state, CONFIG.listForSaleAp);

  state.saleListings[car.id] = {
    carId: car.id,
    askingCents: input.askingCents,
    advertText: input.advertText.trim(),
    disclosedFaultIds: [...new Set(input.disclosedFaultIds)],
    disclosedModificationIds: [...new Set(input.disclosedModificationIds)],
    listedDay: state.day,
    quality: advertQuality(input.advertText),
    status: "active",
  };
  emit(state, "info", `Your ${titleOf(car)} is advertised at ${formatMoney(input.askingCents)}. Buyers respond overnight.`, events);
}

export function updateAskingPrice(state: GameState, carId: string, askingCents: Cents, events: GameEvent[]): void {
  const listing = state.saleListings[carId];
  if (!listing || listing.status !== "active") fail("That car isn't advertised.");
  if (!Number.isSafeInteger(askingCents) || askingCents <= 0) fail("Enter a valid asking price.");
  listing.askingCents = askingCents;
  emit(state, "info", `Asking price changed to ${formatMoney(askingCents)}.`, events);
}

function invalidateOffers(state: GameState, carId: string, except: string | null) {
  for (const b of Object.values(state.buyers)) {
    if (b.carId === carId && b.status === "offered" && b.id !== except) b.status = "invalidated";
  }
}

export function withdrawListing(state: GameState, carId: string, events: GameEvent[]): void {
  const listing = state.saleListings[carId];
  if (!listing || listing.status !== "active") fail("That car isn't advertised.");
  listing.status = "withdrawn";
  invalidateOffers(state, carId, null);
  emit(state, "info", "Advert withdrawn. Outstanding offers were cancelled.", events);
}

function demandMultiplier(ratio: number): number {
  if (ratio <= 0.92) return 1.7;
  if (ratio <= 1.0) return 1.2;
  if (ratio <= 1.08) return 0.75;
  if (ratio <= 1.18) return 0.35;
  if (ratio <= 1.3) return 0.12;
  return 0.03;
}

/**
 * Generate buyer responses to active adverts for the new day. Each buyer
 * inspects the car in their own way before making an offer. Seeded by
 * (car, day), so a given day's buyers are fixed.
 */
export function generateBuyers(state: GameState, events: GameEvent[]): void {
  for (const listing of Object.values(state.saleListings)) {
    if (listing.status !== "active") continue;
    const car = state.cars[listing.carId];
    if (!car || car.status !== "owned") continue;
    const rng = rngFor(state.worldSeed, "buyers", car.id, state.day);
    const advertValue = marketValueCents(advertView(car, listing, indexFor(state, car)));
    const qualityFactor = 0.96 + 0.07 * listing.quality;
    const ratio = listing.askingCents / (advertValue * qualityFactor);
    const repFactor = clamp(1 + 0.03 * state.reputation, 0.5, 1.3);
    const lambda = 0.9 * demandMultiplier(ratio) * (0.6 + 0.8 * listing.quality) * repFactor;
    const count = Math.min(3, Math.floor(lambda) + (rng.next() < lambda - Math.floor(lambda) ? 1 : 0));

    for (let i = 0; i < count; i++) {
      const id = nextId(state, "buyer");
      const inspection = rng.weighted(["test-drive", "look-over", "mechanic"] as const, (x) =>
        x === "test-drive" ? 0.4 : x === "look-over" ? 0.35 : 0.25,
      );
      const pref = rng.range(0.92, 1.08);
      let maxPrice = Math.round(advertValue * pref * qualityFactor);
      const discovered: string[] = [];
      let penalty = 0;
      let knewAndHid = false;
      for (const fault of car.truth.faults) {
        if (fault.repaired || listing.disclosedFaultIds.includes(fault.id)) continue;
        const type = getFaultType(fault.typeId);
        const p =
          inspection === "test-drive"
            ? type.detect.testDrive
            : inspection === "look-over"
              ? 1 - (1 - type.detect.visual) * (1 - type.detect.testDrive)
              : Math.max(type.detect.ppi, type.detect.testDrive);
        if (rollFor(state.worldSeed, "buyer-detect", id, fault.id) < p) {
          discovered.push(fault.id);
          penalty += Math.round(faultDiscountCents(fault.typeId, fault.severity) * 1.25);
          if (car.knowledge.confirmedFaults.some((c) => c.faultId === fault.id)) knewAndHid = true;
        }
      }
      for (const m of car.truth.hiddenModifications) {
        if (listing.disclosedModificationIds.includes(m) || inspection !== "mechanic") continue;
        penalty += Math.round(advertValue * 0.03);
      }
      maxPrice -= penalty;
      const name = rng.pick(BUYER_NAMES);
      const hasMajor = discovered.some((f) => car.truth.faults.find((x) => x.id === f)?.severity === "major");
      const walks = discovered.length > 0 && (hasMajor || penalty > advertValue * 0.2 || (knewAndHid && rng.next() < 0.5));

      let offer = maxPrice >= listing.askingCents ? listing.askingCents : roundTo(maxPrice * rng.range(0.92, 0.99), 5000);
      offer = Math.min(offer, listing.askingCents);
      if (!walks && offer < listing.askingCents * 0.55) continue;

      const faultNames = discovered.map((f) => getFaultType(car.truth.faults.find((x) => x.id === f)!.typeId).name.toLowerCase());
      let message: string;
      if (walks) {
        message = `My ${inspection === "mechanic" ? "mechanic" : "mate"} found ${faultNames.join(" and ")} that wasn't in the ad. I'm out.`;
      } else if (discovered.length) {
        message = `Had a look and found ${faultNames.join(" and ")}. I can offer ${formatMoney(offer)}.`;
      } else if (offer >= listing.askingCents) {
        message = `Happy to pay your asking price of ${formatMoney(offer)}.`;
      } else {
        message = inspection === "test-drive" ? `Drove nicely. Would you take ${formatMoney(offer)}?` : `Looked it over, seems good. Offering ${formatMoney(offer)}.`;
      }

      const buyer: Buyer = {
        id,
        carId: car.id,
        name,
        inspection,
        maxPriceCents: Math.max(0, maxPrice),
        offerCents: offer,
        offerDay: state.day,
        expiresDay: state.day + CONFIG.buyerOfferValidDays,
        status: walks ? "walked-away" : "offered",
        countered: false,
        discoveredFaultIds: discovered,
        message,
      };
      state.buyers[id] = buyer;
      if (knewAndHid) {
        state.reputation = Math.max(REPUTATION_MIN, state.reputation - 1);
        emit(state, "bad", `${name} found a problem you knew about but didn't disclose. Reputation −1.`, events);
      }
      emit(state, walks ? "bad" : "good", `${name} (${titleOf(car)}): “${message}”`, events);
    }
  }
}

/** Expire buyer offers whose validity ended before the current day. */
export function expireBuyerOffers(state: GameState): void {
  for (const b of Object.values(state.buyers)) {
    if (b.status === "offered" && b.expiresDay < state.day) b.status = "expired";
  }
  // Keep the save small: forget resolved buyers from sold/withdrawn cars after a week.
  for (const [id, b] of Object.entries(state.buyers)) {
    if (b.status !== "offered" && b.offerDay < state.day - 7) delete state.buyers[id];
  }
}

function requireOpenOffer(state: GameState, buyerId: string): Buyer {
  const buyer = state.buyers[buyerId];
  if (!buyer) fail("That offer no longer exists.");
  if (buyer.status === "expired" || (buyer.status === "offered" && buyer.expiresDay < state.day)) {
    buyer.status = "expired";
    fail("That offer has expired.");
  }
  if (buyer.status !== "offered") fail("That offer is no longer open.");
  const listing = state.saleListings[buyer.carId];
  if (!listing || listing.status !== "active") fail("That car is no longer advertised.");
  return buyer;
}

export function acceptBuyerOffer(state: GameState, buyerId: string, events: GameEvent[]): void {
  const buyer = requireOpenOffer(state, buyerId);
  const car = requireOwnedCar(state, buyer.carId);
  spendActionPoints(state, CONFIG.acceptOfferAp);
  buyer.status = "accepted";
  settleSale(state, car, buyer.offerCents, "private", buyer.id, events);
}

export function counterBuyerOffer(state: GameState, buyerId: string, amountCents: Cents, events: GameEvent[]): void {
  const buyer = requireOpenOffer(state, buyerId);
  const listing = state.saleListings[buyer.carId]!;
  if (buyer.countered) fail(`${buyer.name} has already given you their final answer.`);
  if (!Number.isSafeInteger(amountCents) || amountCents <= buyer.offerCents) fail("A counter-offer must be higher than their offer.");
  if (amountCents > listing.askingCents) fail("You can't counter above your own asking price.");
  buyer.countered = true;
  if (amountCents <= buyer.maxPriceCents) {
    buyer.offerCents = amountCents;
    buyer.message = `OK, ${formatMoney(amountCents)} it is.`;
    emit(state, "good", `${buyer.name} agreed to ${formatMoney(amountCents)}. Accept the offer to complete the sale.`, events);
  } else if (rollFor(state.worldSeed, "counter", buyer.id) < 0.5) {
    buyer.status = "walked-away";
    buyer.message = "That's too rich for me, sorry.";
    emit(state, "bad", `${buyer.name} walked away.`, events);
  } else {
    buyer.message = `Sorry, ${formatMoney(buyer.offerCents)} is my limit.`;
    emit(state, "info", `${buyer.name}: “${buyer.message}”`, events);
  }
}

export function declineBuyerOffer(state: GameState, buyerId: string, events: GameEvent[]): void {
  const buyer = requireOpenOffer(state, buyerId);
  buyer.status = "declined";
  emit(state, "info", `You declined ${buyer.name}'s offer.`, events);
}

/**
 * What the player expects a wholesaler to pay, from the player's own
 * knowledge. The wholesaler inspects the car on arrival and pays on the spot,
 * so the exact figure is only revealed once the player has committed.
 */
export function wholesaleEstimate(state: GameState, carId: string): { lowCents: Cents; highCents: Cents } {
  const car = requireOwnedCar(state, carId);
  const est = estimateResale(playerView(state, car));
  return {
    lowCents: Math.max(CONFIG.wholesaleFloor, roundTo(est.lowCents * CONFIG.wholesaleFactor, 5000)),
    highCents: Math.max(CONFIG.wholesaleFloor, roundTo(est.highCents * CONFIG.wholesaleFactor, 5000)),
  };
}

/** The wholesaler's actual payout after their own full inspection. Engine-internal. */
export function wholesalePayout(state: GameState, car: Car): Cents {
  return Math.max(CONFIG.wholesaleFloor, roundTo(trueValueToday(state, car) * CONFIG.wholesaleFactor, 5000));
}

export function sellToWholesaler(state: GameState, carId: string, events: GameEvent[]): void {
  const car = requireOwnedCar(state, carId);
  if (activeJobsFor(state, carId).length > 0) fail("Wait for the workshop to finish first.");
  const payout = wholesalePayout(state, car);
  spendActionPoints(state, CONFIG.wholesaleAp);
  settleSale(state, car, payout, "wholesale", null, events);
}

/**
 * Transfer ownership, credit cash, record the flip and cancel competing
 * offers — all in one step. Called only from validated commands.
 */
function settleSale(
  state: GameState,
  car: Car,
  priceCents: Cents,
  channel: "private" | "wholesale",
  buyerId: string | null,
  events: GameEvent[],
): void {
  if (car.status !== "owned") throw new Error("settleSale on a car that is not owned");
  post(state, channel === "private" ? "sale" : "wholesale", priceCents, car.id, `Sold ${titleOf(car)}${channel === "wholesale" ? " to wholesaler" : ""}`);
  car.status = "sold";
  car.sale = { day: state.day, priceCents, channel };
  state.owned = state.owned.filter((id) => id !== car.id);
  const listing = state.saleListings[car.id];
  if (listing && listing.status === "active") listing.status = "sold";
  invalidateOffers(state, car.id, buyerId);

  const knownUnrepaired = car.knowledge.confirmedFaults.filter((f) => !f.repaired).map((f) => f.faultId);
  const honest = channel === "wholesale" || (listing !== undefined && knownUnrepaired.every((f) => listing.disclosedFaultIds.includes(f)));
  const flip = buildFlipRecord(state, car, priceCents, channel, honest);
  state.flips.push(flip);
  if (channel === "private" && honest) state.reputation = Math.min(REPUTATION_MAX, state.reputation + 1);

  const verdict = flip.profitCents >= 0 ? `profit ${formatMoney(flip.profitCents)}` : `loss ${formatMoney(-flip.profitCents)}`;
  emit(state, flip.profitCents >= 0 ? "good" : "bad", `Sold the ${titleOf(car)} for ${formatMoney(priceCents)} — ${verdict}.`, events);
  if (channel === "private" && honest) emit(state, "good", "Honest sale: reputation +1.", events);
  checkUnlocks(state, events);
}

export function buildFlipRecord(
  state: GameState,
  car: Car,
  saleCents: Cents,
  channel: "private" | "wholesale",
  honest: boolean,
): FlipRecord {
  const entries = state.ledger.filter((e) => e.carId === car.id);
  const cost = (kinds: string[]) => -entries.filter((e) => kinds.includes(e.kind)).reduce((a, e) => a + e.amountCents, 0);
  const purchaseCents = cost(["purchase"]);
  const acquisitionCents = cost(["acquisition-fee"]);
  const inspectionCents = cost(["inspection", "diagnosis"]);
  const repairCents = cost(["repair"]);
  const detailCents = cost(["detail"]);
  const holdingCents = cost(["holding"]);
  const otherCents = cost(["service"]);
  const totalCostCents = purchaseCents + acquisitionCents + inspectionCents + repairCents + detailCents + holdingCents + otherCents;
  return {
    carId: car.id,
    title: titleOf(car),
    boughtDay: car.acquisition?.day ?? state.day,
    soldDay: state.day,
    channel,
    purchaseCents,
    acquisitionCents,
    inspectionCents,
    repairCents,
    detailCents,
    holdingCents,
    otherCents,
    totalCostCents,
    saleCents,
    profitCents: saleCents - totalCostCents,
    honest,
  };
}
