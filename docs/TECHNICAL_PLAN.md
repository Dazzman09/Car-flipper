# Car Flipper Tycoon — implementation notes

The full technical plan document (`Car-Flipper-Tycoon-Technical-Plan.md`, 19
sections) was not in the repository when this was built; implementation followed
the plan summary supplied with the request (first release scope, image
requirement, architecture, truth vs knowledge, gameplay systems, economy,
milestones M1–M8 and verification priorities). Where the summary left details
open, the decisions below were made.

## Architecture

| Layer | Location | Notes |
|---|---|---|
| Application | `src/app`, `src/components` | Next.js App Router. The whole game sits inside a client boundary (`GameProvider`) because it uses state, event handlers and localStorage. |
| State | `src/store/gameStore.ts` | Zustand vanilla store. Holds the current game, forwards commands to the engine, autosaves. Never saves before hydration. |
| Simulation | `src/engine` | Plain TypeScript, no React. `dispatch(state, command)` is the only way to change the game. |
| Validation | `src/engine/state.ts` | Zod schema is the single source of truth for the save format; types are inferred. |
| Persistence | `src/persistence/save.ts` | Main + backup slots, checksum, versioned migrations, export/import. |
| Tests | `tests`, `e2e` | Vitest for rules and economy; Playwright for browser journeys (desktop and portrait mobile). |

**Components request actions; the engine decides.** `dispatch` runs a command
against a copy of the state. Any rule violation throws a `CommandError`, and the
original state is returned untouched, so every command is atomic (purchase,
sale settlement, job booking). After every successful command the engine
asserts `startingCash + Σ ledger = cash`.

The engine is deterministic: every random outcome is derived from the career's
world seed plus a stable key (`rngFor(seed, "detect", faultId, method)`).
Repeating, refreshing or reloading can't reroll inspections, buyers or market
movement. It can move behind a server API unchanged.

## Truth vs knowledge

Each car stores `truth` (faults with severity and actual repair cost, service
history, presentation, hidden modifications, maintenance) and `knowledge`
(inspections done, claims with verification status, symptoms, confirmed faults,
discovered modifications, service evidence). Faults are generated when a car
enters the world and never change except by workshop repair.

Player-facing numbers come from `PublicCarView`, which has no `truth` or seller
data. `estimateResale` takes only that view. It allows for the *statistical*
fault risk for the car's variant, age and kilometres (public facts), scaled by
how little has been inspected, and widens the low end for unexplained symptoms
using the worst case for that system — never the actual fault. The wholesaler
pays from its own inspection only after the player commits, so the exit price
can't be used to probe hidden faults either.

## Gameplay rules chosen

- **Action points:** 4/day. Visual inspection and test drive 1 AP each; PPI 1 AP + $250; buying, advertising, accepting an offer and wholesaling 1 AP each. Questions, offers and workshop bookings are free (limited by seller patience and cash).
- **Inspections:** visual confirms visible faults; a test drive yields symptoms only; a PPI confirms faults with severity and checks the logbook; workshop diagnosis (owned cars, $180, next day) confirms nearly everything. Each method can be done once per car.
- **Sellers:** disclose some known faults in the listing (priced in); may hide others (priced as clean). Reservation price is hidden. Rules: accept any offer ≥ reservation; otherwise counter (never rising, never below reservation); patience falls with each rejection and faster for lowballs or backwards offers; a confirmed undisclosed fault lowers price once (more if the seller was caught hiding it). Agreed prices hold until the end of the next day.
- **Workshop:** jobs are paid upfront and complete on a given day; repairs fix exactly their fault; detailing only improves presentation (once); servicing adds a receipt but repairs nothing. Each quote shows cost, completion day, what it fixes, estimated resale benefit and cash afterwards.
- **Selling:** advert with price, text (scored for quality) and structured disclosures (only confirmed faults / known mods). Buyers arrive overnight; each test drives, looks it over or brings a mechanic, may find undisclosed faults and cut the offer or walk. Hiding a fault you knew about costs reputation when found. Offers expire after 2 days; one counter per buyer. Settlement transfers ownership, credits cash, records the flip and invalidates competing offers in one step.
- **Recovery:** side jobs ($35 per remaining AP) and wholesale exit.
- **Progression:** reputation (+1 per honest private sale, −1 per discovered deception, capped −20…25) raises buyer interest; third garage space after 3 flips and reputation 3 ($2,000); premium stock (SUV, ute, sports) after 4 flips and reputation 5.
- **Market:** per-segment weekly price index (±7%), shown to the player.
- **Money:** integer cents everywhere; holding cost $15/car/day; transfer fee $100.

All values live in `src/engine/config.ts` and the catalogue files and are
initial balancing parameters.

## Economy check

`npm run simulate` runs bots that play through the command interface using only
player-visible information. Representative result (20 careers × 40 days):

| Strategy | Mean gain | Losing flips | Notes |
|---|---|---|---|
| careful (inspect, negotiate, repair/detail, disclose) | ≈ +$16k | ≈ 1% | ≈ $1.7k profit per flip, ≈ 17% margin |
| side jobs only | +$5.6k | – | income floor |
| blind (buy at asking, relist) | ≈ −$13k | ≈ 99% | |
| dishonest (hide known faults) | ≈ −$12k | ≈ 95% | reputation collapses |
| wholesale arbitrage | ≈ −$13k | 100% | |

`tests/economy.test.ts` locks these orderings in. Known balance notes: the
careful bot is conservative, so its loss rate is low; human players will take
more risk. Long careers accelerate once premium stock unlocks (higher-value cars,
proportionally larger margins); this is intended progression but should be
watched in playtesting.

## Deliberately out of scope for the first release

Natural-language negotiation, server sync, multiple save slots, auctions,
financing, odometer fraud, post-sale warranty claims, and more than one photo
angle per variant.
