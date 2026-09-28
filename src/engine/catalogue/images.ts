import { getVariant, VARIANTS, type VehicleVariant } from "./variants";

/**
 * Vehicle image registry.
 *
 * A car's visible configuration (colour, visible trim, visible modifications,
 * compatible model years) is taken FROM the image set chosen for it, never the
 * other way around. That is what guarantees the listing never shows a white
 * sedan for a black coupe.
 *
 * Verification status:
 *  - "verified": a person has checked every item in `checks` against the photo
 *    and its source page, and the licence permits reuse with the recorded
 *    attribution. Only verified sets may spawn under the "verified-only" policy
 *    (the release policy).
 *  - "pending": no photograph has been sourced yet, or it has not been checked.
 *    The UI renders a labelled illustration drawn from the same configuration.
 *  - "rejected": kept for audit; never spawns.
 *
 * See docs/IMAGE_SOURCING.md for the sourcing workflow and acceptance checks.
 */

export type VerificationStatus = "verified" | "pending" | "rejected";

export type ImageAngle = "front-three-quarter" | "rear-three-quarter" | "side" | "front" | "rear" | "interior";

export interface VerificationChecks {
  makeModel: boolean;
  generation: boolean;
  facelift: boolean;
  bodyStyle: boolean;
  trim: boolean;
  modifications: boolean;
  colour: boolean;
  modelYear: boolean;
}

export interface ImageRecord {
  id: string;
  angle: ImageAngle;
  /** Path under /public (self-hosted copy) or null when not yet sourced. */
  src: string | null;
  source: {
    /** Page describing the file, e.g. the Wikimedia Commons file page. */
    pageUrl: string | null;
    platform: string | null;
  };
  photographer: string | null;
  licence: { name: string; url: string } | null;
  /** Exact attribution line to display with the image. */
  attribution: string | null;
  verification: {
    status: VerificationStatus;
    checks: VerificationChecks;
    verifiedBy: string | null;
    verifiedOn: string | null;
    notes: string;
  };
}

export interface ImageSet {
  id: string;
  variantId: string;
  colour: { name: string; hex: string };
  /** Model years the photographed car is documented to be compatible with. */
  compatibleYears: readonly [number, number];
  /** Trim as visible in the photograph (badges, wheels, lights). */
  visibleTrim: string;
  /** Visible modification ids present in the photograph. */
  visibleModifications: readonly string[];
  images: readonly ImageRecord[];
}

export type ImagePolicy = "verified-only" | "allow-pending";

const NO_CHECKS: VerificationChecks = {
  makeModel: false,
  generation: false,
  facelift: false,
  bodyStyle: false,
  trim: false,
  modifications: false,
  colour: false,
  modelYear: false,
};

function pendingPhoto(id: string, notes: string): ImageRecord {
  return {
    id,
    angle: "front-three-quarter",
    src: null,
    source: { pageUrl: null, platform: null },
    photographer: null,
    licence: null,
    attribution: null,
    verification: { status: "pending", checks: { ...NO_CHECKS }, verifiedBy: null, verifiedOn: null, notes },
  };
}

function pendingSet(
  variantId: string,
  colour: { name: string; hex: string },
  visibleModifications: readonly string[] = [],
): ImageSet {
  const variant = getVariant(variantId);
  const slug = colour.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    id: `${variantId}--${slug}`,
    variantId,
    colour,
    compatibleYears: variant.productionYears,
    visibleTrim: variant.trim,
    visibleModifications,
    images: [
      pendingPhoto(
        `${variantId}--${slug}--front34`,
        "Not yet sourced. Target: an exterior front three-quarter photo of this exact generation, facelift, body style, trim and colour.",
      ),
    ],
  };
}

/**
 * Launch target: one image set (one accurate exterior photo) per variant.
 * The colour listed is the colour the sourced photo must show; if the best
 * available verified photo is a different colour, change the colour here to
 * match the photo — never the reverse.
 */
export const IMAGE_SETS: readonly ImageSet[] = [
  pendingSet("toyota-corolla-e170-ascent-sedan", { name: "Glacier White", hex: "#f2f3f1" }),
  pendingSet("mazda-3-bm-maxx-hatch", { name: "Soul Red", hex: "#9c1b24" }),
  pendingSet("hyundai-i30-gd-active-hatch", { name: "Sleek Silver", hex: "#b8bcc0" }),
  pendingSet("toyota-camry-xv50-altise-sedan", { name: "Silver Pearl", hex: "#c3c6c8" }),
  pendingSet("holden-commodore-vf-sv6-sedan", { name: "Phantom Black", hex: "#16171a" }),
  pendingSet("ford-falcon-fg-xr6-sedan", { name: "Winter White", hex: "#eeeeea" }),
  pendingSet("honda-jazz-ge-vti-hatch", { name: "Polished Metal", hex: "#7d8288" }),
  pendingSet("suzuki-swift-fz-gl-hatch", { name: "Pearl Metallic Blue", hex: "#2c4f8f" }),
  pendingSet("volkswagen-golf-mk6-90tsi-trendline-hatch", { name: "Reflex Silver", hex: "#aeb2b5" }),
  pendingSet("mazda-cx5-ke-maxx-2wd", { name: "Sky Blue", hex: "#4d7fae" }),
  pendingSet("toyota-hilux-an120-sr-dualcab-4x4", { name: "Glacier White", hex: "#f2f3f1" }),
  pendingSet("mazda-mx5-nc2-roadster", { name: "True Red", hex: "#b3121b" }),
];

export function isImageSetEligible(set: ImageSet, policy: ImagePolicy): boolean {
  if (set.images.length === 0) return false;
  if (set.images.some((i) => i.verification.status === "rejected")) return false;
  if (policy === "allow-pending") return true;
  return set.images.every((i) => isImageVerified(i));
}

export function isImageVerified(image: ImageRecord): boolean {
  const v = image.verification;
  return (
    v.status === "verified" &&
    image.src !== null &&
    image.licence !== null &&
    image.attribution !== null &&
    image.source.pageUrl !== null &&
    Object.values(v.checks).every(Boolean)
  );
}

export function imageSetsForVariant(variantId: string, policy: ImagePolicy): ImageSet[] {
  return IMAGE_SETS.filter((s) => s.variantId === variantId && isImageSetEligible(s, policy));
}

/** Variants that can appear in the world under the given policy. */
export function spawnableVariants(policy: ImagePolicy): VehicleVariant[] {
  return VARIANTS.filter((v) => imageSetsForVariant(v.id, policy).length > 0);
}

const SETS_BY_ID = new Map(IMAGE_SETS.map((s) => [s.id, s]));

export function getImageSet(id: string): ImageSet {
  const s = SETS_BY_ID.get(id);
  if (!s) throw new Error(`Unknown image set ${id}`);
  return s;
}

export interface ImageAuditIssue {
  imageSetId: string;
  imageId?: string;
  problem: string;
}

/**
 * Structural audit of the registry. Returns every problem that would stop a
 * set from being release-ready. Used by tests and scripts/verify-images.ts.
 */
export function auditImageRegistry(sets: readonly ImageSet[] = IMAGE_SETS): ImageAuditIssue[] {
  const issues: ImageAuditIssue[] = [];
  const seen = new Set<string>();
  for (const set of sets) {
    if (seen.has(set.id)) issues.push({ imageSetId: set.id, problem: "Duplicate image set id" });
    seen.add(set.id);
    let variant: VehicleVariant | undefined;
    try {
      variant = getVariant(set.variantId);
    } catch {
      issues.push({ imageSetId: set.id, problem: `Unknown variant ${set.variantId}` });
      continue;
    }
    const [from, to] = set.compatibleYears;
    if (from > to) issues.push({ imageSetId: set.id, problem: "compatibleYears is reversed" });
    if (from < variant.productionYears[0] || to > variant.productionYears[1]) {
      issues.push({ imageSetId: set.id, problem: "compatibleYears falls outside the variant's production years" });
    }
    if (!/^#[0-9a-f]{6}$/i.test(set.colour.hex)) issues.push({ imageSetId: set.id, problem: "Invalid colour hex" });
    if (set.images.length === 0) issues.push({ imageSetId: set.id, problem: "No images" });
    if (!set.images.some((i) => i.angle === "front-three-quarter" || i.angle === "side" || i.angle === "front")) {
      issues.push({ imageSetId: set.id, problem: "No primary exterior image" });
    }
    for (const img of set.images) {
      if (!isImageVerified(img)) {
        const missing: string[] = [];
        if (img.verification.status !== "verified") missing.push(`status is ${img.verification.status}`);
        if (!img.src) missing.push("no file");
        if (!img.licence) missing.push("no licence");
        if (!img.attribution) missing.push("no attribution");
        if (!img.source.pageUrl) missing.push("no source page");
        const failed = Object.entries(img.verification.checks)
          .filter(([, ok]) => !ok)
          .map(([k]) => k);
        if (failed.length) missing.push(`unchecked: ${failed.join(", ")}`);
        issues.push({ imageSetId: set.id, imageId: img.id, problem: missing.join("; ") });
      }
    }
  }
  for (const v of VARIANTS) {
    if (!sets.some((s) => s.variantId === v.id)) {
      issues.push({ imageSetId: "(none)", problem: `Variant ${v.id} has no image set` });
    }
  }
  return issues;
}
