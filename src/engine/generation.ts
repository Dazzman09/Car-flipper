import { FAULT_TYPES, SEVERITIES, faultChance, getFaultType, type Severity } from "./catalogue/faults";
import { imageSetsForVariant, spawnableVariants, type ImagePolicy, type ImageSet } from "./catalogue/images";
import { MODIFICATIONS } from "./catalogue/modifications";
import type { VehicleVariant } from "./catalogue/variants";
import { CONFIG, CURRENT_YEAR, KM_PER_YEAR } from "./config";
import { roundTo, type Cents } from "./money";
import { rngFor, type Rng } from "./rng";
import type { ActualFault, Car, Claim, Seller, ServiceHistory } from "./state";
import { clamp, marketValueCents, serviceEvidenceFromHistory } from "./valuation";
import { getImageSet } from "./catalogue/images";
import { marketIndex } from "./market";

const FIRST_NAMES = [
  "Jess", "Liam", "Priya", "Tom", "Mei", "Callum", "Aisha", "Nick", "Sophie", "Raj", "Brooke", "Dan",
  "Ngaio", "Marco", "Chloe", "Hamish", "Leilani", "Josh", "Tahlia", "Ben", "Hui", "Sam", "Georgia", "Ali",
];
const SUBURBS = [
  "Parramatta", "Frankston", "Logan", "Joondalup", "Elizabeth", "Penrith", "Werribee", "Ipswich",
  "Blacktown", "Dandenong", "Belconnen", "Glenorchy", "Rockingham", "Campbelltown",
];
const REASONS: readonly { text: string; urgency: [number, number] }[] = [
  { text: "Moving overseas next week, need it gone.", urgency: [0.8, 1] },
  { text: "Bought a new car, this one is just sitting in the driveway.", urgency: [0.4, 0.7] },
  { text: "Upgrading to something bigger for the family.", urgency: [0.3, 0.6] },
  { text: "Selling for my parents, they don't drive any more.", urgency: [0.5, 0.8] },
  { text: "Need the cash for a house deposit.", urgency: [0.6, 0.9] },
  { text: "Not in a rush, happy to wait for the right price.", urgency: [0, 0.25] },
  { text: "Company car arrived, so this has to go.", urgency: [0.5, 0.8] },
];

export interface GenerationContext {
  worldSeed: number;
  day: number;
  premiumUnlocked: boolean;
  imagePolicy: ImagePolicy;
}

export function eligibleVariants(ctx: GenerationContext, maxTier: 1 | 2 = 2): VehicleVariant[] {
  return spawnableVariants(ctx.imagePolicy).filter((v) => v.tier === 1 || (ctx.premiumUnlocked && maxTier === 2));
}

/**
 * Create a car. The image set is chosen FIRST; the car's colour, visible trim,
 * visible modifications and model year are then constrained to it.
 */
export function generateCar(
  ctx: GenerationContext,
  id: string,
  options: { variants?: readonly VehicleVariant[] } = {},
): Car {
  const rng = rngFor(ctx.worldSeed, "car", id);
  const pool = options.variants ?? eligibleVariants(ctx);
  if (pool.length === 0) throw new Error("No spawnable variants: no image set satisfies the image policy.");
  const variant = rng.weighted(pool, (v) => (v.tier === 1 ? 1 : 0.6));
  const sets = imageSetsForVariant(variant.id, ctx.imagePolicy);
  const imageSet: ImageSet = rng.pick(sets);

  const yearFrom = Math.max(variant.productionYears[0], imageSet.compatibleYears[0]);
  const yearTo = Math.min(variant.productionYears[1], imageSet.compatibleYears[1]);
  if (yearFrom > yearTo) throw new Error(`Image set ${imageSet.id} has no year overlap with ${variant.id}`);
  const year = rng.int(yearFrom, yearTo);
  const age = Math.max(1, CURRENT_YEAR - year);

  const maintenance = clamp(0.6 + rng.normal() * 0.2, 0.05, 1);
  const odometerKm = Math.round((age * KM_PER_YEAR * clamp(1 + rng.normal() * 0.3, 0.4, 1.9)) / 100) * 100;
  const serviceHistory = pickServiceHistory(rng, maintenance);
  const presentation = Math.round(clamp(38 + maintenance * 38 + rng.normal() * 10, 15, 90));

  const faults = generateFaults(rng, id, variant, age, odometerKm, maintenance);
  const hiddenModifications = MODIFICATIONS.filter(
    (m) => !m.visible && (!m.segments || m.segments.includes(variant.segment)) && rng.chance(m.baseChance),
  ).map((m) => m.id);

  const sellerRng = rngFor(ctx.worldSeed, "seller", id);
  const reason = sellerRng.pick(REASONS);
  const urgency = clamp(sellerRng.range(reason.urgency[0], reason.urgency[1]), 0, 1);
  const personality = sellerRng.pick(["friendly", "blunt", "haggler", "proud"] as const);
  const honesty = clamp(0.3 + sellerRng.next() * 0.7, 0, 1);
  const mechanicalKnowledge = clamp(0.15 + sellerRng.next() * 0.8, 0, 1);
  for (const f of faults) {
    const obvious = f.typeId === "panel-damage" || f.typeId === "worn-tyres" || f.typeId === "aircon-fault";
    f.sellerKnows = obvious || sellerRng.chance(mechanicalKnowledge);
    f.sellerDisclosed = f.sellerKnows && sellerRng.chance(honesty);
  }
  const disclosed = faults.filter((f) => f.sellerDisclosed);

  // The seller discounts only for faults they admit to. Faults they know about
  // but hide are priced as if the car were fine.
  const sellerPerceived = marketValueCents({
    variant,
    year,
    odometerKm,
    presentation,
    serviceEvidence: serviceEvidenceFromHistory(serviceHistory),
    modifications: [...imageSet.visibleModifications, ...hiddenModifications],
    knownFaults: disclosed.map((f) => ({ typeId: f.typeId, severity: f.severity })),
    marketIndex: marketIndex(ctx.worldSeed, variant.segment, ctx.day),
  });
  const personalityAskBonus = { friendly: 0, blunt: 0.01, haggler: 0.05, proud: 0.06 }[personality];
  // Most sellers start high; a desperate few price to sell fast, and those are the bargains.
  const motivated = urgency > 0.85 && sellerRng.chance(0.6);
  const askFactor = motivated
    ? sellerRng.range(0.9, 0.98)
    : 1.03 + 0.08 * (1 - urgency) + personalityAskBonus + sellerRng.range(-0.02, 0.03);
  const askingCents = roundTo(sellerPerceived * askFactor, 10000);
  const personalityFloor = { friendly: 0, blunt: 0.01, haggler: -0.01, proud: 0.03 }[personality];
  const reservationCents = Math.min(
    askingCents,
    roundTo(
      sellerPerceived * (motivated ? askFactor - 0.04 : clamp(0.97 - 0.12 * urgency + personalityFloor + sellerRng.range(-0.02, 0.02), 0.84, 1.0)),
      5000,
    ),
  );
  const patienceBase = { friendly: 5, blunt: 3, haggler: 6, proud: 3 }[personality];
  const maxPatience = patienceBase + sellerRng.int(0, 2);

  const name = `${sellerRng.pick(FIRST_NAMES)} (${sellerRng.pick(SUBURBS)})`;
  const seller: Seller = {
    name,
    personality,
    urgency,
    honesty,
    mechanicalKnowledge,
    patience: maxPatience,
    maxPatience,
    reservationCents,
    currentAskCents: askingCents,
    concessionsUsed: [],
    offers: [],
    status: "open",
    agreed: null,
    questionsAsked: [],
    reason: reason.text,
  };

  const { description, claims } = writeListing(sellerRng, id, variant, year, odometerKm, serviceHistory, faults, honesty);
  const confirmedFaults = disclosed.map((f) => ({
    faultId: f.id,
    typeId: f.typeId,
    severity: f.severity,
    source: "listing" as const,
    day: ctx.day,
    repaired: false,
  }));

  const lifetime = rng.int(CONFIG.listingLifetimeDays.min, CONFIG.listingLifetimeDays.max);
  return {
    id,
    variantId: variant.id,
    imageSetId: imageSet.id,
    year,
    odometerKm,
    generatedDay: ctx.day,
    status: "listed",
    goneReason: null,
    truth: { faults, serviceHistory, presentation, hiddenModifications, maintenance },
    seller,
    listing: { askingCents, postedDay: ctx.day, expiresDay: ctx.day + lifetime, description },
    knowledge: {
      inspections: [],
      claims,
      symptoms: [],
      confirmedFaults,
      discoveredModifications: [],
      serviceEvidence: "unknown",
      notes: [],
    },
    acquisition: null,
    sale: null,
  };
}

function pickServiceHistory(rng: Rng, maintenance: number): ServiceHistory {
  const roll = rng.next();
  if (maintenance > 0.7) return roll < 0.8 ? "full" : "partial";
  if (maintenance > 0.4) return roll < 0.25 ? "full" : roll < 0.85 ? "partial" : "none";
  return roll < 0.35 ? "partial" : "none";
}

function generateFaults(
  rng: Rng,
  carId: string,
  variant: VehicleVariant,
  age: number,
  km: number,
  maintenance: number,
): ActualFault[] {
  const faults: ActualFault[] = [];
  for (const type of FAULT_TYPES) {
    const p = faultChance(type, variant, age, km, maintenance);
    if (p <= 0 || !rng.chance(p)) continue;
    const options = SEVERITIES.filter((s) => type.severities[s]);
    const severity: Severity = rng.weighted(options, (s) => {
      const w = type.severities[s]?.weight ?? 0;
      return s === "major" ? w * (1.3 - maintenance) : w;
    });
    const profile = type.severities[severity]!;
    const repairCents: Cents = Math.round(rng.range(profile.repairCents[0], profile.repairCents[1]) / 1000) * 1000;
    faults.push({
      id: `${carId}:${type.id}`,
      typeId: type.id,
      severity,
      repairCents,
      repaired: false,
      sellerKnows: false,
      sellerDisclosed: false,
    });
  }
  return faults;
}

function writeListing(
  rng: Rng,
  carId: string,
  variant: VehicleVariant,
  year: number,
  km: number,
  history: ServiceHistory,
  faults: readonly ActualFault[],
  honesty: number,
): { description: string; claims: Claim[] } {
  const claims: Claim[] = [];
  const parts: string[] = [`${year} ${variant.make} ${variant.model} ${variant.trim}, ${km.toLocaleString("en-AU")} km.`];
  const disclosed = faults.filter((f) => f.sellerDisclosed);
  const hiding = faults.some((f) => f.sellerKnows && !f.sellerDisclosed);
  if (disclosed.length > 0) {
    parts.push(`Known issues: ${disclosed.map((f) => getFaultType(f.typeId).name.toLowerCase()).join(", ")}. Priced accordingly.`);
  }
  if (disclosed.length === 0 || hiding) {
    const text = hiding
      ? rng.pick(["Runs and drives perfectly.", "Mechanically A1.", "No issues at all, very reliable."])
      : rng.pick(["Runs well as far as I know.", "Never given me any trouble."]);
    parts.push(text);
    claims.push({ id: `${carId}:claim:runs`, topic: "mechanical", text, source: "listing", status: "unverified" });
  }

  const honestListing = rng.next() < honesty;
  if (history === "full" || (!honestListing && rng.chance(0.5))) {
    const text = "Full service history.";
    parts.push(text);
    claims.push({ id: `${carId}:claim:service`, topic: "service", text, source: "listing", status: "unverified" });
  } else if (history === "partial") {
    parts.push("Some service receipts.");
  }
  parts.push(rng.pick(["Rego till March.", "Genuine reason for sale.", "Cash or bank transfer only.", "No time wasters please."]));
  return { description: parts.join(" "), claims };
}

/** Human-readable title, e.g. "2015 Toyota Corolla Ascent". */
export function carTitle(car: Pick<Car, "year" | "variantId">, variant: VehicleVariant): string {
  return `${car.year} ${variant.make} ${variant.model} ${variant.trim}`;
}

export function carColour(car: Pick<Car, "imageSetId">): { name: string; hex: string } {
  return getImageSet(car.imageSetId).colour;
}
