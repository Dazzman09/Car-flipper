import { dollars } from "./money";

/**
 * Balancing parameters. Every number here is an initial design value and is
 * expected to change after playtesting and economy simulation (see
 * scripts/simulate-economy.ts).
 */
export const CONFIG = {
  startingCash: dollars(15_000),
  startingGarageSpaces: 2,
  maxGarageSpaces: 3,
  marketplaceSize: 18,
  /** Minimum listings whose asking price is within reach of a starting career. */
  minAffordableListings: 6,
  affordableThreshold: dollars(12_000),
  actionPointsPerDay: 4,

  listingLifetimeDays: { min: 5, max: 12 },
  /** Daily probability a listing sells to a simulated competitor, scaled by how good a deal it is. */
  competitorBaseSaleChance: 0.06,
  competitorDealBonus: 0.25,

  acquisitionFee: dollars(100),
  holdingCostPerCarPerDay: dollars(15),

  inspections: {
    visual: { ap: 1, cost: 0 },
    testDrive: { ap: 1, cost: 0 },
    ppi: { ap: 1, cost: dollars(250) },
    /** Workshop diagnosis on an owned car. */
    diagnosis: { ap: 0, cost: dollars(180), days: 1 },
  },
  purchaseAp: 1,
  listForSaleAp: 1,
  acceptOfferAp: 1,
  wholesaleAp: 1,
  /** Wholesalers pay this fraction of the car's value as found by their own inspection. */
  wholesaleFactor: 0.72,
  wholesaleFloor: dollars(400),

  sideJob: { minAp: 2, payPerAp: dollars(35) },

  detail: { cost: dollars(150), days: 1, presentationGain: 25, maxPresentation: 95 },
  service: { cost: dollars(320), days: 1 },

  acceptedQuoteValidDays: 1,
  buyerOfferValidDays: 2,

  garageUpgrade: { cost: dollars(2_000), minFlips: 3, minReputation: 3 },
  premiumStock: { minFlips: 4, minReputation: 5 },

  startingReputation: 0,
} as const;

/** Expected kilometres driven per year for an average Australian passenger car. */
export const KM_PER_YEAR = 14_000;

/** In-world calendar year for valuations. */
export const CURRENT_YEAR = 2026;
