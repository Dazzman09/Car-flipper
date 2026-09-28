/**
 * Deterministic randomness.
 *
 * Every random outcome in the game is derived from the career's world seed plus a
 * stable key (e.g. car id + "ppi"). Outcomes therefore cannot be rerolled by
 * refreshing, reloading or repeating a command: the same question always gets
 * the same answer.
 */

/** 32-bit FNV-1a hash of a string. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
  /** Approximately normal (sum of uniforms), mean 0, sd ~1. */
  normal(): number;
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  const rng: Rng = {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => Math.floor(min + (max - min + 1) * next()),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error("pick from empty list");
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    weighted: (items, weight) => {
      const weights = items.map((i) => Math.max(0, weight(i)));
      const total = weights.reduce((a, b) => a + b, 0);
      if (items.length === 0 || total <= 0) throw new Error("weighted pick with no positive weights");
      let roll = next() * total;
      for (let i = 0; i < items.length; i++) {
        roll -= weights[i] as number;
        if (roll < 0) return items[i] as (typeof items)[number];
      }
      return items[items.length - 1] as (typeof items)[number];
    },
    normal: () => {
      let s = 0;
      for (let i = 0; i < 6; i++) s += next();
      return (s - 3) / Math.sqrt(0.5);
    },
  };
  return rng;
}

/** RNG for a named purpose within a career. Same (seed, key) ⇒ same sequence. */
export function rngFor(worldSeed: number, ...keyParts: (string | number)[]): Rng {
  return createRng(hashString(`${worldSeed}|${keyParts.join("|")}`));
}

/** Single deterministic roll in [0,1) for (seed, key). */
export function rollFor(worldSeed: number, ...keyParts: (string | number)[]): number {
  return rngFor(worldSeed, ...keyParts).next();
}
