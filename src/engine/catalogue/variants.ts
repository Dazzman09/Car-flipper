import type { Cents } from "../money";
import { dollars } from "../money";

export type BodyStyle = "sedan" | "hatch" | "wagon" | "suv" | "ute" | "convertible";
export type Segment = "light" | "small" | "medium" | "large" | "suv" | "ute" | "sports";
export type Transmission = "manual" | "automatic" | "CVT" | "dual-clutch";

/**
 * One precisely identified vehicle configuration. A variant is only spawnable
 * when at least one image set in images.ts is eligible for it.
 *
 * Production years are Australian-market model years for this generation and
 * facelift phase. They are catalogue facts and must be checked against a
 * reliable source during image verification (see docs/IMAGE_SOURCING.md).
 */
export interface VehicleVariant {
  id: string;
  make: string;
  model: string;
  generation: string;
  facelift: "pre-facelift" | "facelift";
  bodyStyle: BodyStyle;
  trim: string;
  engine: string;
  transmission: Transmission;
  drivetrain: "FWD" | "RWD" | "4WD";
  productionYears: readonly [number, number];
  segment: Segment;
  /** Tier 2 variants appear once the premium-stock milestone is reached. */
  tier: 1 | 2;
  value: {
    /** Private-sale value for an average-condition car of refYear with typical kilometres. */
    refYear: number;
    refCents: Cents;
    perYearCents: Cents;
    /** Fractional value change per 10,000 km above/below the expected odometer. */
    kmSensitivity: number;
  };
  /** Multipliers applied to a fault type's base chance for this variant. */
  faultWeights?: Readonly<Record<string, number>>;
}

export const VARIANTS: readonly VehicleVariant[] = [
  {
    id: "toyota-corolla-e170-ascent-sedan",
    make: "Toyota",
    model: "Corolla",
    generation: "E170 (ZRE172R)",
    facelift: "pre-facelift",
    bodyStyle: "sedan",
    trim: "Ascent",
    engine: "1.8L petrol",
    transmission: "CVT",
    drivetrain: "FWD",
    productionYears: [2014, 2016],
    segment: "small",
    tier: 1,
    value: { refYear: 2015, refCents: dollars(11_300), perYearCents: dollars(700), kmSensitivity: 0.028 },
  },
  {
    id: "mazda-3-bm-maxx-hatch",
    make: "Mazda",
    model: "Mazda3",
    generation: "BM",
    facelift: "pre-facelift",
    bodyStyle: "hatch",
    trim: "Maxx",
    engine: "2.0L petrol",
    transmission: "automatic",
    drivetrain: "FWD",
    productionYears: [2014, 2016],
    segment: "small",
    tier: 1,
    value: { refYear: 2015, refCents: dollars(10_800), perYearCents: dollars(700), kmSensitivity: 0.028 },
  },
  {
    id: "hyundai-i30-gd-active-hatch",
    make: "Hyundai",
    model: "i30",
    generation: "GD",
    facelift: "pre-facelift",
    bodyStyle: "hatch",
    trim: "Active",
    engine: "1.8L petrol",
    transmission: "manual",
    drivetrain: "FWD",
    productionYears: [2012, 2014],
    segment: "small",
    tier: 1,
    value: { refYear: 2013, refCents: dollars(6_900), perYearCents: dollars(550), kmSensitivity: 0.03 },
    faultWeights: { "clutch-wear": 1.3 },
  },
  {
    id: "toyota-camry-xv50-altise-sedan",
    make: "Toyota",
    model: "Camry",
    generation: "XV50",
    facelift: "pre-facelift",
    bodyStyle: "sedan",
    trim: "Altise",
    engine: "2.5L petrol",
    transmission: "automatic",
    drivetrain: "FWD",
    productionYears: [2012, 2014],
    segment: "medium",
    tier: 1,
    value: { refYear: 2013, refCents: dollars(8_800), perYearCents: dollars(600), kmSensitivity: 0.025 },
  },
  {
    id: "holden-commodore-vf-sv6-sedan",
    make: "Holden",
    model: "Commodore",
    generation: "VF",
    facelift: "pre-facelift",
    bodyStyle: "sedan",
    trim: "SV6",
    engine: "3.6L V6 petrol",
    transmission: "automatic",
    drivetrain: "RWD",
    productionYears: [2013, 2015],
    segment: "large",
    tier: 1,
    value: { refYear: 2014, refCents: dollars(11_800), perYearCents: dollars(800), kmSensitivity: 0.026 },
    faultWeights: { "suspension-bushes": 1.3 },
  },
  {
    id: "ford-falcon-fg-xr6-sedan",
    make: "Ford",
    model: "Falcon",
    generation: "FG",
    facelift: "pre-facelift",
    bodyStyle: "sedan",
    trim: "XR6",
    engine: "4.0L inline-six petrol",
    transmission: "automatic",
    drivetrain: "RWD",
    productionYears: [2008, 2011],
    segment: "large",
    tier: 1,
    value: { refYear: 2010, refCents: dollars(7_200), perYearCents: dollars(500), kmSensitivity: 0.024 },
    faultWeights: { "suspension-bushes": 1.4, "oil-leak": 1.2 },
  },
  {
    id: "honda-jazz-ge-vti-hatch",
    make: "Honda",
    model: "Jazz",
    generation: "GE",
    facelift: "pre-facelift",
    bodyStyle: "hatch",
    trim: "VTi",
    engine: "1.5L petrol",
    transmission: "automatic",
    drivetrain: "FWD",
    productionYears: [2008, 2011],
    segment: "light",
    tier: 1,
    value: { refYear: 2010, refCents: dollars(6_300), perYearCents: dollars(450), kmSensitivity: 0.028 },
  },
  {
    id: "suzuki-swift-fz-gl-hatch",
    make: "Suzuki",
    model: "Swift",
    generation: "FZ",
    facelift: "pre-facelift",
    bodyStyle: "hatch",
    trim: "GL",
    engine: "1.4L petrol",
    transmission: "manual",
    drivetrain: "FWD",
    productionYears: [2011, 2013],
    segment: "light",
    tier: 1,
    value: { refYear: 2012, refCents: dollars(5_600), perYearCents: dollars(400), kmSensitivity: 0.03 },
  },
  {
    id: "volkswagen-golf-mk6-90tsi-trendline-hatch",
    make: "Volkswagen",
    model: "Golf",
    generation: "Mk6 (Typ 5K)",
    facelift: "pre-facelift",
    bodyStyle: "hatch",
    trim: "90TSI Trendline",
    engine: "1.4L turbo petrol",
    transmission: "dual-clutch",
    drivetrain: "FWD",
    productionYears: [2010, 2012],
    segment: "small",
    tier: 1,
    value: { refYear: 2011, refCents: dollars(6_600), perYearCents: dollars(500), kmSensitivity: 0.032 },
    faultWeights: { "transmission-wear": 3.5, "electrical-fault": 1.4 },
  },
  {
    id: "mazda-cx5-ke-maxx-2wd",
    make: "Mazda",
    model: "CX-5",
    generation: "KE",
    facelift: "pre-facelift",
    bodyStyle: "suv",
    trim: "Maxx (2WD)",
    engine: "2.0L petrol",
    transmission: "automatic",
    drivetrain: "FWD",
    productionYears: [2012, 2014],
    segment: "suv",
    tier: 2,
    value: { refYear: 2013, refCents: dollars(13_500), perYearCents: dollars(900), kmSensitivity: 0.026 },
  },
  {
    id: "toyota-hilux-an120-sr-dualcab-4x4",
    make: "Toyota",
    model: "HiLux",
    generation: "AN120",
    facelift: "pre-facelift",
    bodyStyle: "ute",
    trim: "SR Double Cab 4x4",
    engine: "2.8L turbo-diesel",
    transmission: "automatic",
    drivetrain: "4WD",
    productionYears: [2015, 2017],
    segment: "ute",
    tier: 2,
    value: { refYear: 2016, refCents: dollars(31_000), perYearCents: dollars(1_800), kmSensitivity: 0.02 },
    faultWeights: { "suspension-bushes": 1.4, "panel-damage": 1.3 },
  },
  {
    id: "mazda-mx5-nc2-roadster",
    make: "Mazda",
    model: "MX-5",
    generation: "NC (NC2)",
    facelift: "facelift",
    bodyStyle: "convertible",
    trim: "Roadster (soft top)",
    engine: "2.0L petrol",
    transmission: "manual",
    drivetrain: "RWD",
    productionYears: [2009, 2012],
    segment: "sports",
    tier: 2,
    value: { refYear: 2010, refCents: dollars(14_800), perYearCents: dollars(600), kmSensitivity: 0.03 },
  },
];

const VARIANTS_BY_ID = new Map(VARIANTS.map((v) => [v.id, v]));

export function getVariant(id: string): VehicleVariant {
  const v = VARIANTS_BY_ID.get(id);
  if (!v) throw new Error(`Unknown variant ${id}`);
  return v;
}

export function variantTitle(v: VehicleVariant): string {
  return `${v.make} ${v.model} ${v.trim}`;
}

export function variantDescriptor(v: VehicleVariant): string {
  const trans =
    v.transmission === "dual-clutch" ? "DSG auto" : v.transmission === "CVT" ? "CVT auto" : v.transmission;
  return `${v.generation} · ${v.bodyStyle} · ${v.engine} · ${trans} · ${v.drivetrain}`;
}
