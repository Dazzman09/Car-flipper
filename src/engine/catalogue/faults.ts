import type { Cents } from "../money";
import { dollars } from "../money";
import type { VehicleVariant } from "./variants";

export type Severity = "minor" | "moderate" | "major";
export const SEVERITIES: readonly Severity[] = ["minor", "moderate", "major"];

export type FaultSystem =
  | "engine"
  | "transmission"
  | "brakes"
  | "suspension"
  | "body"
  | "tyres"
  | "cooling"
  | "climate"
  | "electrical";

export type DetectionMethod = "visual" | "testDrive" | "ppi" | "diagnosis";

export interface SeverityProfile {
  /** Probability weight of this severity when the fault occurs. */
  weight: number;
  repairCents: readonly [Cents, Cents];
  repairDays: number;
}

export interface FaultType {
  id: string;
  name: string;
  system: FaultSystem;
  description: string;
  /** Baseline probability per car before age/km/maintenance/variant adjustments. */
  baseChance: number;
  severities: Partial<Record<Severity, SeverityProfile>>;
  /**
   * Probability that each method reveals the fault. Visual inspection and PPI
   * confirm a fault; a test drive only reveals a symptom of the system.
   */
  detect: Record<DetectionMethod, number>;
  /** What a test drive feels like when this fault is present. Several faults share a symptom. */
  symptom?: string;
  /** What a visual inspection shows. */
  visualCue?: string;
  /** Buyers who know about an unrepaired fault discount repair cost × this factor. */
  resaleDiscountFactor: number;
  /** Restrict to certain drivetrain configurations. */
  appliesTo?: (variant: VehicleVariant) => boolean;
}

const r = (min: number, max: number) => [dollars(min), dollars(max)] as const;

export const FAULT_TYPES: readonly FaultType[] = [
  {
    id: "worn-tyres",
    name: "Worn tyres",
    system: "tyres",
    description: "Tread is close to the legal limit on two or more tyres.",
    baseChance: 0.24,
    severities: {
      minor: { weight: 3, repairCents: r(380, 620), repairDays: 1 },
      moderate: { weight: 1, repairCents: r(700, 1000), repairDays: 1 },
    },
    detect: { visual: 0.9, testDrive: 0.25, ppi: 1, diagnosis: 1 },
    symptom: "Road noise and a slightly vague feel on wet corners",
    visualCue: "Shallow tread and uneven wear on the front tyres",
    resaleDiscountFactor: 1.1,
  },
  {
    id: "brake-wear",
    name: "Worn brakes",
    system: "brakes",
    description: "Pads and rotors are near their service limit.",
    baseChance: 0.22,
    severities: {
      minor: { weight: 3, repairCents: r(260, 450), repairDays: 1 },
      moderate: { weight: 1.5, repairCents: r(500, 900), repairDays: 1 },
    },
    detect: { visual: 0.2, testDrive: 0.55, ppi: 0.95, diagnosis: 1 },
    symptom: "Brakes squeal and the pedal feels long",
    visualCue: "Deep lip on the front brake rotors",
    resaleDiscountFactor: 1.2,
  },
  {
    id: "engine-mounts",
    name: "Worn engine mounts",
    system: "engine",
    description: "Rubber engine mounts have perished.",
    baseChance: 0.14,
    severities: {
      minor: { weight: 2, repairCents: r(350, 600), repairDays: 1 },
      moderate: { weight: 1, repairCents: r(650, 950), repairDays: 2 },
    },
    detect: { visual: 0, testDrive: 0.6, ppi: 0.8, diagnosis: 1 },
    symptom: "Vibration through the cabin at idle",
    resaleDiscountFactor: 1.3,
  },
  {
    id: "oil-leak",
    name: "Oil leak",
    system: "engine",
    description: "Engine oil is weeping from a gasket or seal.",
    baseChance: 0.17,
    severities: {
      minor: { weight: 3, repairCents: r(220, 500), repairDays: 1 },
      moderate: { weight: 1.5, repairCents: r(600, 1400), repairDays: 2 },
      major: { weight: 0.4, repairCents: r(1600, 2600), repairDays: 3 },
    },
    detect: { visual: 0.35, testDrive: 0.3, ppi: 0.9, diagnosis: 1 },
    symptom: "A faint burning-oil smell after the drive",
    visualCue: "Oil residue on the underside of the engine",
    resaleDiscountFactor: 1.4,
  },
  {
    id: "suspension-bushes",
    name: "Worn suspension bushes",
    system: "suspension",
    description: "Control-arm bushes and links are worn.",
    baseChance: 0.17,
    severities: {
      minor: { weight: 2, repairCents: r(300, 600), repairDays: 1 },
      moderate: { weight: 1, repairCents: r(700, 1300), repairDays: 2 },
    },
    detect: { visual: 0.05, testDrive: 0.55, ppi: 0.85, diagnosis: 1 },
    symptom: "Clunking from the front end over bumps",
    resaleDiscountFactor: 1.2,
  },
  {
    id: "cooling-system",
    name: "Cooling system fault",
    system: "cooling",
    description: "Radiator, water pump or head gasket problem.",
    baseChance: 0.09,
    severities: {
      minor: { weight: 2, repairCents: r(260, 520), repairDays: 1 },
      moderate: { weight: 1, repairCents: r(650, 1200), repairDays: 2 },
      major: { weight: 0.35, repairCents: r(2600, 4000), repairDays: 4 },
    },
    detect: { visual: 0.1, testDrive: 0.35, ppi: 0.6, diagnosis: 1 },
    symptom: "Temperature gauge creeps up in traffic",
    visualCue: "Dried coolant crust around the radiator cap",
    resaleDiscountFactor: 1.6,
  },
  {
    id: "transmission-wear",
    name: "Automatic transmission wear",
    system: "transmission",
    description: "Worn clutch packs, valve body or mechatronic unit.",
    baseChance: 0.07,
    severities: {
      moderate: { weight: 2, repairCents: r(1200, 2400), repairDays: 3 },
      major: { weight: 1, repairCents: r(3000, 5200), repairDays: 5 },
    },
    detect: { visual: 0, testDrive: 0.5, ppi: 0.45, diagnosis: 1 },
    symptom: "Harsh or delayed gear changes",
    resaleDiscountFactor: 1.7,
    appliesTo: (v) => v.transmission !== "manual",
  },
  {
    id: "clutch-wear",
    name: "Worn clutch",
    system: "transmission",
    description: "Clutch friction plate is near the end of its life.",
    baseChance: 0.2,
    severities: {
      moderate: { weight: 1, repairCents: r(950, 1700), repairDays: 2 },
    },
    detect: { visual: 0, testDrive: 0.7, ppi: 0.8, diagnosis: 1 },
    symptom: "Clutch bites very high and slips under load",
    resaleDiscountFactor: 1.3,
    appliesTo: (v) => v.transmission === "manual",
  },
  {
    id: "rust",
    name: "Body rust",
    system: "body",
    description: "Corrosion in the wheel arches or sills.",
    baseChance: 0.07,
    severities: {
      minor: { weight: 2, repairCents: r(450, 900), repairDays: 2 },
      moderate: { weight: 1, repairCents: r(1200, 2500), repairDays: 4 },
    },
    detect: { visual: 0.5, testDrive: 0, ppi: 0.9, diagnosis: 1 },
    visualCue: "Bubbling paint around the rear wheel arches",
    resaleDiscountFactor: 1.5,
  },
  {
    id: "panel-damage",
    name: "Panel damage",
    system: "body",
    description: "Dents, scrapes or hail marks on one or more panels.",
    baseChance: 0.15,
    severities: {
      minor: { weight: 3, repairCents: r(300, 700), repairDays: 1 },
      moderate: { weight: 1, repairCents: r(900, 2000), repairDays: 3 },
    },
    detect: { visual: 0.95, testDrive: 0, ppi: 1, diagnosis: 1 },
    visualCue: "Dents and scrapes on the bodywork",
    resaleDiscountFactor: 1.2,
  },
  {
    id: "aircon-fault",
    name: "Air-conditioning fault",
    system: "climate",
    description: "Low refrigerant, a leaking condenser or a failed compressor.",
    baseChance: 0.13,
    severities: {
      minor: { weight: 2, repairCents: r(200, 420), repairDays: 1 },
      moderate: { weight: 1, repairCents: r(800, 1600), repairDays: 2 },
    },
    detect: { visual: 0, testDrive: 0.9, ppi: 0.9, diagnosis: 1 },
    symptom: "Air conditioning blows warm",
    resaleDiscountFactor: 1.3,
  },
  {
    id: "electrical-fault",
    name: "Electrical fault",
    system: "electrical",
    description: "An intermittent sensor, wiring or module fault.",
    baseChance: 0.08,
    severities: {
      minor: { weight: 2, repairCents: r(150, 400), repairDays: 1 },
      moderate: { weight: 1, repairCents: r(500, 1200), repairDays: 2 },
    },
    detect: { visual: 0, testDrive: 0.3, ppi: 0.4, diagnosis: 0.95 },
    symptom: "An intermittent warning light on the dash",
    resaleDiscountFactor: 1.5,
  },
];

/**
 * Probability that a car has a given fault when it enters the world. Shared by
 * generation (with the car's hidden maintenance level) and by the player's
 * estimate prior (with average maintenance), so the two stay consistent.
 */
export function faultChance(type: FaultType, variant: VehicleVariant, age: number, km: number, maintenance: number): number {
  if (type.appliesTo && !type.appliesTo(variant)) return 0;
  const ageFactor = Math.min(1.3, 0.5 + age * 0.04);
  const kmFactor = 0.6 + Math.min(km, 320_000) / 400_000;
  const careFactor = 1.4 - maintenance;
  const weight = variant.faultWeights?.[type.id] ?? 1;
  return Math.min(0.8, type.baseChance * weight * ageFactor * kmFactor * careFactor);
}

/** Maintenance level assumed when the player has no information. */
export const AVERAGE_MAINTENANCE = 0.6;

const FAULTS_BY_ID = new Map(FAULT_TYPES.map((f) => [f.id, f]));

export function getFaultType(id: string): FaultType {
  const f = FAULTS_BY_ID.get(id);
  if (!f) throw new Error(`Unknown fault type ${id}`);
  return f;
}

/** Midpoint of a severity's repair range: what a player can expect before a workshop quote. */
export function typicalRepairCents(faultId: string, severity: Severity): Cents {
  const profile = getFaultType(faultId).severities[severity];
  if (!profile) throw new Error(`${faultId} has no ${severity} severity`);
  return Math.round((profile.repairCents[0] + profile.repairCents[1]) / 2);
}

/**
 * The worst plausible cost behind an unexplained symptom in a system. Used to
 * widen the player's estimate — it depends only on the system, never on the
 * actual hidden fault.
 */
export function worstCaseForSystem(system: FaultSystem): Cents {
  let worst = 0;
  for (const f of FAULT_TYPES) {
    if (f.system !== system) continue;
    for (const s of Object.values(f.severities)) {
      if (s) worst = Math.max(worst, s.repairCents[1]);
    }
  }
  return worst;
}

export const SYSTEM_LABELS: Record<FaultSystem, string> = {
  engine: "Engine",
  transmission: "Transmission",
  brakes: "Brakes",
  suspension: "Suspension",
  body: "Body",
  tyres: "Tyres",
  cooling: "Cooling",
  climate: "Air conditioning",
  electrical: "Electrical",
};
