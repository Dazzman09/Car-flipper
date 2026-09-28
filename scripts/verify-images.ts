/**
 * Release gate for vehicle images. Fails (exit code 1) unless every catalogue
 * variant has at least one fully verified, attributed photograph and every
 * image file referenced exists under /public.
 *
 * Usage: npm run verify:images
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { IMAGE_SETS, auditImageRegistry, spawnableVariants } from "../src/engine/catalogue/images";
import { VARIANTS } from "../src/engine/catalogue/variants";

const issues = auditImageRegistry();
for (const set of IMAGE_SETS) {
  for (const img of set.images) {
    if (img.src && !existsSync(path.join("public", img.src))) {
      issues.push({ imageSetId: set.id, imageId: img.id, problem: `file not found: public${img.src}` });
    }
  }
}

const ready = spawnableVariants("verified-only");
console.log(`Vehicle image verification`);
console.log(`  Variants in catalogue:             ${VARIANTS.length}`);
console.log(`  Variants with a verified photo:    ${ready.length}`);
console.log(`  Image sets:                        ${IMAGE_SETS.length}`);
console.log(`  Issues:                            ${issues.length}\n`);
for (const i of issues) console.log(`  ✗ ${i.imageSetId}${i.imageId ? ` / ${i.imageId}` : ""}: ${i.problem}`);

if (issues.length > 0 || ready.length < VARIANTS.length) {
  console.log("\nRelease requirement NOT met: every spawnable car needs a verified matching photograph (docs/IMAGE_SOURCING.md).");
  process.exit(1);
}
console.log("All variants have verified photographs.");
