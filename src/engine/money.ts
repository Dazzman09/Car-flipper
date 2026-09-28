/**
 * All money in the simulation is stored as integer cents (AUD).
 * Helpers here are the only place where dollars/cents conversion happens.
 */
export type Cents = number;

export function dollars(amount: number): Cents {
  return Math.round(amount * 100);
}

export function assertCents(value: number, label = "amount"): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be an integer number of cents, got ${value}`);
  }
  return value;
}

/** Multiply cents by a factor and round to the nearest cent. */
export function scale(cents: Cents, factor: number): Cents {
  return Math.round(cents * factor);
}

/** Round to the nearest `step` cents (default $50) — used for human-looking prices. */
export function roundTo(cents: Cents, step: Cents = 5000): Cents {
  return Math.round(cents / step) * step;
}

export function sum(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

const formatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

/** Format cents as a whole-dollar AUD string, e.g. 620000 -> "$6,200". */
export function formatMoney(cents: Cents): string {
  return formatter.format(Math.round(cents / 100));
}

/** Signed format, e.g. "+$1,040" or "−$250". */
export function formatSigned(cents: Cents): string {
  if (cents === 0) return formatMoney(0);
  return `${cents > 0 ? "+" : "−"}${formatMoney(Math.abs(cents))}`;
}

/** Parse a user-entered dollar string ("6,200", "$6200.50") into cents. Returns null if invalid. */
export function parseDollars(input: string): Cents | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Math.round(Number(cleaned) * 100);
  return Number.isSafeInteger(value) ? value : null;
}
