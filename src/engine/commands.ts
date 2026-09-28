import { CommandError, emit } from "./core";
import { askQuestion, inspect } from "./inspection";
import { buyCar, makeOffer, presentEvidence, useDialogue, type DialogueOption } from "./negotiation";
import { doSideJob, upgradeGarage } from "./progression";
import {
  acceptBuyerOffer,
  counterBuyerOffer,
  createSaleListing,
  declineBuyerOffer,
  sellToWholesaler,
  updateAskingPrice,
  withdrawListing,
} from "./selling";
import type { GameEvent, GameState, JobKind, QuestionId } from "./state";
import { advanceDay } from "./time";
import { bookJob } from "./workshop";
import { ledgerBalances } from "./finance";

/**
 * Everything the player can do. Components send commands; the engine decides
 * whether they are valid.
 */
export type Command =
  | { type: "askQuestion"; carId: string; question: QuestionId }
  | { type: "inspect"; carId: string; method: "visual" | "testDrive" | "ppi" }
  | { type: "makeOffer"; carId: string; amountCents: number }
  | { type: "presentEvidence"; carId: string; faultId: string }
  | { type: "dialogue"; carId: string; option: DialogueOption }
  | { type: "buy"; carId: string }
  | { type: "bookJob"; carId: string; kind: JobKind; faultId?: string | null }
  | {
      type: "listForSale";
      carId: string;
      askingCents: number;
      advertText: string;
      disclosedFaultIds: string[];
      disclosedModificationIds: string[];
    }
  | { type: "updateAskingPrice"; carId: string; askingCents: number }
  | { type: "withdrawListing"; carId: string }
  | { type: "acceptBuyerOffer"; buyerId: string }
  | { type: "counterBuyerOffer"; buyerId: string; amountCents: number }
  | { type: "declineBuyerOffer"; buyerId: string }
  | { type: "sellToWholesaler"; carId: string }
  | { type: "sideJob" }
  | { type: "upgradeGarage" }
  | { type: "advanceDay" }
  | { type: "dismissTutorial" };

export type CommandResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; state: GameState; error: string };

function apply(state: GameState, cmd: Command, events: GameEvent[]): void {
  switch (cmd.type) {
    case "askQuestion":
      askQuestion(state, cmd.carId, cmd.question, events);
      return;
    case "inspect":
      inspect(state, cmd.carId, cmd.method, events);
      return;
    case "makeOffer":
      makeOffer(state, cmd.carId, cmd.amountCents, events);
      return;
    case "presentEvidence":
      presentEvidence(state, cmd.carId, cmd.faultId, events);
      return;
    case "dialogue":
      useDialogue(state, cmd.carId, cmd.option, events);
      return;
    case "buy":
      buyCar(state, cmd.carId, events);
      return;
    case "bookJob":
      bookJob(state, cmd.carId, cmd.kind, cmd.faultId ?? null, events);
      return;
    case "listForSale":
      createSaleListing(state, cmd, events);
      return;
    case "updateAskingPrice":
      updateAskingPrice(state, cmd.carId, cmd.askingCents, events);
      return;
    case "withdrawListing":
      withdrawListing(state, cmd.carId, events);
      return;
    case "acceptBuyerOffer":
      acceptBuyerOffer(state, cmd.buyerId, events);
      return;
    case "counterBuyerOffer":
      counterBuyerOffer(state, cmd.buyerId, cmd.amountCents, events);
      return;
    case "declineBuyerOffer":
      declineBuyerOffer(state, cmd.buyerId, events);
      return;
    case "sellToWholesaler":
      sellToWholesaler(state, cmd.carId, events);
      return;
    case "sideJob":
      doSideJob(state, events);
      return;
    case "upgradeGarage":
      upgradeGarage(state, events);
      return;
    case "advanceDay":
      advanceDay(state, events);
      return;
    case "dismissTutorial":
      state.tutorial.dismissed = true;
      return;
    default: {
      const never: never = cmd;
      throw new CommandError(`Unknown command ${(never as { type: string }).type}`);
    }
  }
}

/**
 * Apply a command transactionally. The command runs against a copy of the
 * state; if any rule rejects it, the original state is returned unchanged, so
 * a command either happens completely or not at all.
 */
export function dispatch(state: GameState, cmd: Command): CommandResult {
  const draft = structuredClone(state);
  const events: GameEvent[] = [];
  try {
    apply(draft, cmd, events);
  } catch (err) {
    if (err instanceof CommandError) return { ok: false, state, error: err.message };
    throw err;
  }
  if (!ledgerBalances(draft)) throw new Error(`Ledger invariant violated by ${cmd.type}`);
  return { ok: true, state: draft, events };
}

export { emit };
