import { AVERAGE_MAINTENANCE, FAULT_TYPES, faultChance, getFaultType, typicalRepairCents, worstCaseForSystem, type FaultSystem } from "./catalogue/faults";
import { getModification } from "./catalogue/modifications";
import { getVariant, type VehicleVariant } from "./catalogue/variants";
import { getImageSet } from "./catalogue/images";
import { CURRENT_YEAR, KM_PER_YEAR } from "./config";
import { roundTo, type Cents } from "./money";
import type { Car, Knowledge, PublicCarView, ServiceEvidence, Severity } from "./state";

/**
 * A set of facts about a car from one party's point of view. Whoever builds
 * the view decides which faults and history are included — the valuation
 * itself cannot see anything else.
 */
export interface ValuationView {
  variant: VehicleVariant;
  year: number;
  odometerKm: number;
  presentation: number;
  serviceEvidence: ServiceEvidence;
  modifications: readonly string[];
  /** Unrepaired faults this party knows about. */
  knownFaults: readonly { typeId: string; severity: Severity }[];
  /** Segment price index for the day (1 = normal). */
  marketIndex: number;
}

export function baseValueCents(variant: VehicleVariant, year: number): Cents {
  const v = variant.value;
  const raw = v.refCents + (year - v.refYear) * v.perYearCents;
  return Math.max(Math.round(v.refCents * 0.15), raw);
}

export function expectedKm(year: number): number {
  return Math.max(1, CURRENT_YEAR - year) * KM_PER_YEAR;
}

export function kmFactor(variant: VehicleVariant, year: number, km: number): number {
  const delta10k = (km - expectedKm(year)) / 10_000;
  return clamp(1 - delta10k * variant.value.kmSensitivity, 0.55, 1.2);
}

export function presentationFactor(presentation: number): number {
  return 1 + (presentation - 70) * 0.003;
}

export const SERVICE_FACTORS: Record<ServiceEvidence, number> = {
  "logbook-sighted": 1.04,
  "workshop-service": 1.02,
  "partial-records": 1.0,
  unknown: 0.97,
  "no-records": 0.93,
};

export function faultDiscountCents(typeId: string, severity: Severity): Cents {
  return Math.round(typicalRepairCents(typeId, severity) * getFaultType(typeId).resaleDiscountFactor);
}

/** Market value of a car given a party's view of it. */
export function marketValueCents(view: ValuationView): Cents {
  const base = Math.round(baseValueCents(view.variant, view.year) * view.marketIndex);
  let factor = kmFactor(view.variant, view.year, view.odometerKm);
  factor *= presentationFactor(view.presentation);
  factor *= SERVICE_FACTORS[view.serviceEvidence];
  let modEffect = 0;
  for (const m of view.modifications) modEffect += getModification(m).valueEffect;
  factor *= 1 + modEffect;
  let value = Math.round(base * factor);
  for (const f of view.knownFaults) value -= faultDiscountCents(f.typeId, f.severity);
  // Even a car with serious faults is worth something to a repairer or wrecker.
  return Math.max(Math.round(base * 0.3), value);
}

export function serviceEvidenceFromHistory(history: "full" | "partial" | "none"): ServiceEvidence {
  return history === "full" ? "logbook-sighted" : history === "partial" ? "partial-records" : "no-records";
}

/** Everything that is actually true about the car. Engine-internal only. */
export function trueView(car: Car, marketIndex: number): ValuationView {
  return {
    variant: getVariant(car.variantId),
    year: car.year,
    odometerKm: car.odometerKm,
    presentation: car.truth.presentation,
    serviceEvidence:
      car.knowledge.serviceEvidence === "workshop-service"
        ? "workshop-service"
        : serviceEvidenceFromHistory(car.truth.serviceHistory),
    modifications: [...getImageSet(car.imageSetId).visibleModifications, ...car.truth.hiddenModifications],
    knownFaults: car.truth.faults.filter((f) => !f.repaired).map((f) => ({ typeId: f.typeId, severity: f.severity })),
    marketIndex,
  };
}

export function trueValueCents(car: Car, marketIndex: number): Cents {
  return marketValueCents(trueView(car, marketIndex));
}

/** Strip a car down to what the player is allowed to see. */
export function publicView(car: Car, marketIndex: number): PublicCarView {
  return {
    id: car.id,
    variantId: car.variantId,
    imageSetId: car.imageSetId,
    year: car.year,
    odometerKm: car.odometerKm,
    presentation: car.truth.presentation,
    visibleModifications: getImageSet(car.imageSetId).visibleModifications,
    knowledge: car.knowledge,
    marketIndex,
  };
}

export interface ResaleEstimate {
  lowCents: Cents;
  likelyCents: Cents;
  highCents: Cents;
  /** Plain-language reasons the range is as wide as it is. */
  caveats: string[];
  confidence: "low" | "medium" | "high";
}

/**
 * Statistical expectation of fault costs for a car of this variant, age and
 * odometer, assuming average maintenance. Uses only public facts, so it is
 * safe to include in the player's estimate.
 */
export function expectedHiddenFaultCents(variant: VehicleVariant, year: number, km: number): Cents {
  const age = Math.max(1, CURRENT_YEAR - year);
  let total = 0;
  for (const type of FAULT_TYPES) {
    const p = faultChance(type, variant, age, km, AVERAGE_MAINTENANCE);
    if (p <= 0) continue;
    const profiles = Object.entries(type.severities);
    const weightSum = profiles.reduce((a, [, prof]) => a + (prof?.weight ?? 0), 0);
    let avg = 0;
    for (const [sev, prof] of profiles) {
      if (!prof) continue;
      avg += (prof.weight / weightSum) * faultDiscountCents(type.id, sev as Severity);
    }
    total += p * avg;
  }
  return Math.round(total);
}

/** Share of the statistical fault risk still unexamined after the inspections done. */
export function residualRiskShare(k: Knowledge): number {
  const done = new Set(k.inspections.map((i) => i.method));
  if (done.has("diagnosis")) return 0.05;
  if (done.has("ppi")) return 0.2;
  if (done.has("visual") && done.has("testDrive")) return 0.5;
  if (done.has("visual") || done.has("testDrive")) return 0.75;
  return 1;
}

export const BUYER_DISCOVERY_SHARE = 0.6;

function inspectionUncertainty(k: Knowledge): number {
  const done = new Set(k.inspections.map((i) => i.method));
  if (done.has("diagnosis")) return 0.03;
  if (done.has("ppi")) return 0.06;
  if (done.has("visual") && done.has("testDrive")) return 0.1;
  if (done.has("visual") || done.has("testDrive")) return 0.14;
  return 0.18;
}

/**
 * The player's resale estimate. It is a pure function of the public view,
 * which contains only listing details and the player's own knowledge, so it
 * cannot leak an undiscovered fault.
 */
export function estimateResale(view: PublicCarView): ResaleEstimate {
  const k = view.knowledge;
  const unrepaired = k.confirmedFaults.filter((f) => !f.repaired);
  const discoveredMods = [...view.visibleModifications, ...k.discoveredModifications];
  const variant = getVariant(view.variantId);
  const documented = marketValueCents({
    variant,
    year: view.year,
    odometerKm: view.odometerKm,
    presentation: view.presentation,
    serviceEvidence: k.serviceEvidence,
    modifications: discoveredMods,
    knownFaults: unrepaired.map((f) => ({ typeId: f.typeId, severity: f.severity })),
    marketIndex: view.marketIndex,
  });
  // Allow for faults not yet found, in proportion to how little has been checked.
  // Buyers find roughly this share of undisclosed faults, so the likely price
  // allows for part of the risk and the low end for all of it.
  const hiddenRisk = Math.round(expectedHiddenFaultCents(variant, view.year, view.odometerKm) * residualRiskShare(k));
  const floor = Math.round(documented * 0.3);
  const likely = Math.max(floor, documented - Math.round(hiddenRisk * BUYER_DISCOVERY_SHARE));

  const caveats: string[] = [];
  const baseUnc = inspectionUncertainty(k);
  let down = hiddenRisk * (1 - BUYER_DISCOVERY_SHARE) + documented * baseUnc * 0.5;
  if (baseUnc >= 0.1) caveats.push("Limited inspection — hidden faults could lower the value.");

  const confirmedSystems = new Set(k.confirmedFaults.map((f) => getFaultType(f.typeId).system));
  const unexplained = new Set<FaultSystem>();
  for (const s of k.symptoms) {
    if (!confirmedSystems.has(s.system as FaultSystem)) unexplained.add(s.system as FaultSystem);
  }
  for (const system of unexplained) {
    down += worstCaseForSystem(system) * 0.6;
    caveats.push(`Unexplained ${system} symptom — could be expensive.`);
  }
  if (k.serviceEvidence === "unknown") caveats.push("Service history not verified.");

  const low = Math.max(0, roundTo(Math.max(floor * 0.8, likely - down), 5000));
  // Best case: no hidden faults and, if unverified, a full logbook.
  const bestCase =
    k.serviceEvidence === "unknown"
      ? Math.round((documented * SERVICE_FACTORS["logbook-sighted"]) / SERVICE_FACTORS.unknown)
      : documented;
  const high = roundTo(Math.max(likely * 1.05, bestCase * 1.03), 5000);
  const confidence = baseUnc <= 0.06 && unexplained.size === 0 ? "high" : baseUnc <= 0.1 ? "medium" : "low";
  return { lowCents: low, likelyCents: roundTo(likely, 5000), highCents: high, caveats, confidence };
}

export function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}
