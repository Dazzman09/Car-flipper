import type { GameState } from "@/engine/state";

export interface TutorialStep {
  id: string;
  title: string;
  hint: string;
  done: boolean;
}

/** First-flip guide. Each step is derived from game state, so it can't drift out of sync. */
export function tutorialSteps(game: GameState): TutorialStep[] {
  const cars = Object.values(game.cars);
  const asked = cars.some((c) => c.seller.questionsAsked.length > 0);
  const bought = game.owned.length > 0 || game.flips.length > 0;
  const advertised = Object.keys(game.saleListings).length > 0;
  const sold = game.flips.some((f) => f.channel === "private");
  return [
    { id: "browse", title: "Pick a listing", hint: "Open the Market and choose a car within budget.", done: game.stats.inspections > 0 || asked || bought },
    { id: "ask", title: "Question the seller", hint: "Seller claims are just claims. Note what they say.", done: asked || bought },
    { id: "inspect", title: "Inspect it", hint: "A test drive reveals symptoms; a pre-purchase inspection confirms faults.", done: game.stats.inspections > 0 },
    { id: "offer", title: "Negotiate", hint: "Offer below asking. Raise confirmed faults once each.", done: game.stats.offersMade > 0 },
    { id: "buy", title: "Buy it", hint: "Once the seller agrees, buy before the deal lapses.", done: bought },
    { id: "workshop", title: "Add value", hint: "Repair confirmed faults, detail or service it.", done: game.jobs.length > 0 },
    { id: "advertise", title: "Advertise", hint: "Set a price, write an honest ad and disclose known faults.", done: advertised },
    { id: "sell", title: "Sell to a buyer", hint: "Advance days for offers. Accept before they expire.", done: sold },
  ];
}
