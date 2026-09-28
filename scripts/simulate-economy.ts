/**
 * Economy simulation report: runs each strategy over many seeds and prints
 * outcome statistics. Usage: npm run simulate -- [seeds=40] [days=45]
 */
import { STRATEGIES, summarise } from "../src/sim/simulate";
import { formatMoney } from "../src/engine/money";

const seedsArg = Number(process.argv[2] ?? 40);
const days = Number(process.argv[3] ?? 45);
const seeds = Array.from({ length: seedsArg }, (_, i) => 1000 + i);

console.log(`Economy simulation: ${seeds.length} careers × ${days} days per strategy\n`);
const rows = Object.keys(STRATEGIES).map((name) => summarise(name, seeds, days));
const header = ["strategy", "mean gain", "median", "worst", "best", "flips/run", "losing flips", "profit/flip", "margin", "rep"];
console.log(header.join(" | "));
for (const r of rows) {
  console.log(
    [
      r.strategy,
      formatMoney(r.meanGain),
      formatMoney(r.medianGain),
      formatMoney(r.worstGain),
      formatMoney(r.bestGain),
      r.meanFlips.toFixed(1),
      `${(r.losingFlipRate * 100).toFixed(0)}%`,
      formatMoney(r.meanProfitPerFlip),
      `${(r.meanMarginOnPurchase * 100).toFixed(1)}%`,
      r.meanReputation.toFixed(1),
    ].join(" | "),
  );
}
