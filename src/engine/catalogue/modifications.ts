/**
 * Modifications. Visible modifications (wheels, ride height, body kits) are
 * part of an image set because they must appear in the photo; the generator
 * never adds a visible modification the photograph does not show. Hidden
 * modifications can be added procedurally and are discovered through
 * questions or inspections.
 */
export interface ModificationType {
  id: string;
  name: string;
  visible: boolean;
  /** Fractional effect on the typical buyer's valuation (negative = fewer buyers want it). */
  valueEffect: number;
  /** Probability the modification is found by each method. */
  detect: { visual: number; testDrive: number; ppi: number; diagnosis: number };
  baseChance: number;
  /** Only sporty or large cars attract these modifications. */
  segments?: readonly string[];
}

export const MODIFICATIONS: readonly ModificationType[] = [
  {
    id: "aftermarket-wheels",
    name: "Aftermarket alloy wheels",
    visible: true,
    valueEffect: -0.01,
    detect: { visual: 1, testDrive: 1, ppi: 1, diagnosis: 1 },
    baseChance: 0,
  },
  {
    id: "lowered-suspension",
    name: "Lowered suspension",
    visible: true,
    valueEffect: -0.05,
    detect: { visual: 1, testDrive: 1, ppi: 1, diagnosis: 1 },
    baseChance: 0,
  },
  {
    id: "engine-tune",
    name: "Aftermarket engine tune",
    visible: false,
    valueEffect: -0.08,
    detect: { visual: 0, testDrive: 0.2, ppi: 0.7, diagnosis: 0.95 },
    baseChance: 0.06,
    segments: ["large", "sports", "ute"],
  },
  {
    id: "aftermarket-exhaust",
    name: "Aftermarket exhaust",
    visible: false,
    valueEffect: -0.03,
    detect: { visual: 0.3, testDrive: 0.8, ppi: 1, diagnosis: 1 },
    baseChance: 0.08,
    segments: ["large", "sports", "ute", "small"],
  },
  {
    id: "aftermarket-head-unit",
    name: "Aftermarket head unit",
    visible: false,
    valueEffect: 0,
    detect: { visual: 0.9, testDrive: 1, ppi: 1, diagnosis: 1 },
    baseChance: 0.1,
  },
];

const BY_ID = new Map(MODIFICATIONS.map((m) => [m.id, m]));

export function getModification(id: string): ModificationType {
  const m = BY_ID.get(id);
  if (!m) throw new Error(`Unknown modification ${id}`);
  return m;
}
