import { getFaultType, typicalRepairCents } from "./catalogue/faults";
import { CONFIG } from "./config";
import { emit, fail, post, requireListedCar, spendActionPoints, titleOf } from "./core";
import { formatMoney, roundTo, type Cents } from "./money";
import type { Car, GameEvent, GameState } from "./state";

/**
 * Negotiation rules (consistent across all sellers):
 *  1. A seller accepts any offer at or above their hidden reservation price.
 *     The agreed price is the lower of the offer and their current asking price.
 *  2. Otherwise they counter. Counters never rise and never fall below the
 *     reservation. Each rejected offer costs patience; lowballs and offers
 *     lower than your previous one cost more. At zero patience they walk away.
 *  3. A confirmed fault can be raised once. It lowers the reservation and the
 *     asking price one time only; repeating the argument changes nothing.
 *  4. An agreed price is held for a limited time, then lapses.
 */

function clearLapsedAgreement(state: GameState, car: Car) {
  const s = car.seller;
  if (s.status === "agreed" && s.agreed && s.agreed.expiresDay < state.day) {
    s.status = "open";
    s.agreed = null;
  }
}

function requireNegotiable(state: GameState, carId: string): Car {
  const car = requireListedCar(state, carId);
  clearLapsedAgreement(state, car);
  const s = car.seller;
  if (s.status === "walked-away") fail(`${s.name} has stopped replying to you.`);
  if (s.status === "agreed") fail("You already have an agreed price. Buy the car before the agreement lapses.");
  return car;
}

function agree(state: GameState, car: Car, amount: Cents, events: GameEvent[]) {
  const s = car.seller;
  s.status = "agreed";
  s.agreed = { amountCents: amount, expiresDay: state.day + CONFIG.acceptedQuoteValidDays };
  const msg = {
    friendly: "Deal! Come and pick it up whenever suits.",
    blunt: "Fine. Deal.",
    haggler: "You drive a hard bargain. Deal.",
    proud: "Alright. It's a good car, look after it.",
  }[s.personality];
  s.offers.push({ day: state.day, by: "seller", amountCents: amount, outcome: "accepted", message: msg });
  emit(state, "good", `${s.name} accepted ${formatMoney(amount)} for the ${titleOf(car)}. Price held until end of day ${s.agreed.expiresDay}.`, events);
}

export function makeOffer(state: GameState, carId: string, amountCents: Cents, events: GameEvent[]): void {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) fail("Enter a valid offer.");
  const car = requireNegotiable(state, carId);
  const s = car.seller;
  if (amountCents > state.cash) fail("You can't cover that offer with your current cash.");
  state.stats.offersMade += 1;

  const previous = [...s.offers].reverse().find((o) => o.by === "player");
  s.offers.push({ day: state.day, by: "player", amountCents, outcome: "rejected", message: "" });
  const record = s.offers[s.offers.length - 1]!;

  if (amountCents >= s.reservationCents) {
    record.outcome = "accepted";
    agree(state, car, Math.min(amountCents, s.currentAskCents), events);
    return;
  }

  const lowball = amountCents < s.currentAskCents * 0.7;
  const backwards = previous !== undefined && amountCents < previous.amountCents;
  s.patience = Math.max(0, s.patience - 1 - (lowball ? 1 : 0) - (backwards ? 1 : 0));
  record.outcome = "countered";

  if (s.patience === 0) {
    s.status = "walked-away";
    record.outcome = "walked-away";
    const msg = lowball ? "Not interested in lowballers. Good luck." : "I don't think we're going to agree. I'll sell it to someone else.";
    s.offers.push({ day: state.day, by: "seller", amountCents: s.currentAskCents, outcome: "walked-away", message: msg });
    emit(state, "bad", `${s.name} walked away from the negotiation.`, events);
    return;
  }

  const concession = Math.max(0.1, 0.25 + 0.35 * s.urgency - (s.personality === "haggler" ? 0.1 : 0));
  const target = Math.max(amountCents, s.reservationCents);
  let counter = roundTo(s.currentAskCents - (s.currentAskCents - target) * concession, 5000);
  counter = Math.min(s.currentAskCents, Math.max(s.reservationCents, counter));
  const moved = counter < s.currentAskCents;
  s.currentAskCents = counter;

  let message: string;
  if (!moved) message = "That's as low as I'll go.";
  else if (lowball) message = { friendly: "That's a bit low, sorry.", blunt: "No.", haggler: "Ha! Try again.", proud: "That's insulting for a car like this." }[s.personality];
  else message = { friendly: "I can come down a little.", blunt: "Best I can do.", haggler: "Meet me somewhere in the middle?", proud: "It's worth more than that, but alright." }[s.personality];
  message = `${message} ${formatMoney(counter)}.`;
  s.offers.push({ day: state.day, by: "seller", amountCents: counter, outcome: "countered", message });
  emit(state, "info", `${s.name}: “${message}”`, events);
}

export function presentEvidence(state: GameState, carId: string, faultId: string, events: GameEvent[]): void {
  const car = requireNegotiable(state, carId);
  const s = car.seller;
  const confirmed = car.knowledge.confirmedFaults.find((f) => f.faultId === faultId);
  if (!confirmed) fail("You haven't confirmed that fault.");
  if (confirmed.repaired) fail("That fault has been repaired.");
  if (s.concessionsUsed.includes(faultId)) fail("You've already raised that — the seller won't move on it again.");
  const actual = car.truth.faults.find((f) => f.id === faultId);
  if (!actual) fail("That fault doesn't apply to this car.");
  if (actual.sellerDisclosed) fail("That was in the listing — it's already reflected in the price.");

  s.concessionsUsed.push(faultId);
  const type = getFaultType(confirmed.typeId);
  const typical = typicalRepairCents(confirmed.typeId, confirmed.severity);
  // Caught hiding a fault, a seller concedes more than one who genuinely didn't know.
  const factor = actual.sellerKnows ? 0.85 + 0.15 * s.honesty : 0.5 + 0.3 * s.honesty;
  const reduction = roundTo(typical * factor, 5000);
  const floor = roundTo(s.reservationCents * 0.5, 5000);
  s.reservationCents = Math.max(floor, s.reservationCents - reduction);
  s.currentAskCents = Math.max(s.reservationCents, s.currentAskCents - reduction);

  const message = actual.sellerKnows
    ? `Ah… yes, the ${type.name.toLowerCase()}. I should have mentioned it. ${formatMoney(s.currentAskCents)}, then.`
    : `I didn't know about the ${type.name.toLowerCase()}. Fair enough — ${formatMoney(s.currentAskCents)}.`;
  s.offers.push({ day: state.day, by: "seller", amountCents: s.currentAskCents, outcome: "revised", message });
  emit(state, "good", `${s.name}: “${message}”`, events);
}

export type DialogueOption = "cash-ready";

export function useDialogue(state: GameState, carId: string, option: DialogueOption, events: GameEvent[]): void {
  const car = requireNegotiable(state, carId);
  const s = car.seller;
  const key = `dialogue:${option}`;
  if (s.concessionsUsed.includes(key)) fail("You've already said that.");
  s.concessionsUsed.push(key);
  let message: string;
  if (s.urgency > 0.5) {
    s.reservationCents = roundTo(s.reservationCents * 0.98, 5000);
    s.currentAskCents = Math.max(s.reservationCents, roundTo(s.currentAskCents * 0.98, 5000));
    message = `Cash today would really help. I could do ${formatMoney(s.currentAskCents)}.`;
  } else {
    message = "Good to know, but I'm not in a rush.";
  }
  s.offers.push({ day: state.day, by: "seller", amountCents: s.currentAskCents, outcome: "revised", message });
  emit(state, "info", `${s.name}: “${message}”`, events);
}

export function buyCar(state: GameState, carId: string, events: GameEvent[]): void {
  const car = requireListedCar(state, carId);
  clearLapsedAgreement(state, car);
  const s = car.seller;
  if (s.status !== "agreed" || !s.agreed) fail("Agree a price with the seller first.");
  if (s.agreed.expiresDay < state.day) fail("The agreed price has lapsed.");
  if (state.owned.length >= state.garageSpaces) fail("Your garage is full. Sell a car or upgrade your garage first.");
  const price = s.agreed.amountCents;
  if (state.cash < price + CONFIG.acquisitionFee) {
    fail(`You need ${formatMoney(price + CONFIG.acquisitionFee)} including the ${formatMoney(CONFIG.acquisitionFee)} transfer fee.`);
  }
  spendActionPoints(state, CONFIG.purchaseAp);

  post(state, "purchase", -price, car.id, `Bought ${titleOf(car)}`);
  post(state, "acquisition-fee", -CONFIG.acquisitionFee, car.id, "Transfer and PPSR check");
  car.status = "owned";
  car.acquisition = { day: state.day, priceCents: price };
  state.marketplace = state.marketplace.filter((id) => id !== carId);
  state.owned.push(carId);
  emit(state, "good", `You bought the ${titleOf(car)} for ${formatMoney(price)}.`, events);
}
