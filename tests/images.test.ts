import { describe, expect, it } from "vitest";
import {
  IMAGE_SETS,
  auditImageRegistry,
  isImageSetEligible,
  spawnableVariants,
  type ImageSet,
} from "@/engine/catalogue/images";
import { VARIANTS } from "@/engine/catalogue/variants";

const verifiedSet: ImageSet = {
  ...IMAGE_SETS[0]!,
  images: [
    {
      id: "test-image",
      angle: "front-three-quarter",
      src: "/cars/test.jpg",
      source: { pageUrl: "https://commons.wikimedia.org/wiki/File:Test.jpg", platform: "Wikimedia Commons" },
      photographer: "Test Photographer",
      licence: { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
      attribution: "Photo: Test Photographer, CC BY-SA 4.0, via Wikimedia Commons",
      verification: {
        status: "verified",
        checks: { makeModel: true, generation: true, facelift: true, bodyStyle: true, trim: true, modifications: true, colour: true, modelYear: true },
        verifiedBy: "tester",
        verifiedOn: "2026-09-28",
        notes: "",
      },
    },
  ],
};

describe("image registry", () => {
  it("has an image set for every catalogue variant", () => {
    for (const v of VARIANTS) expect(IMAGE_SETS.some((s) => s.variantId === v.id)).toBe(true);
  });

  it("has no structural problems besides unverified photos", () => {
    const structural = auditImageRegistry().filter((i) => !i.imageId);
    expect(structural).toEqual([]);
  });

  it("only fully verified, attributed images satisfy the release policy", () => {
    expect(isImageSetEligible(verifiedSet, "verified-only")).toBe(true);
    const missingLicence = { ...verifiedSet, images: [{ ...verifiedSet.images[0]!, licence: null }] };
    expect(isImageSetEligible(missingLicence, "verified-only")).toBe(false);
    const uncheckedColour = {
      ...verifiedSet,
      images: [{ ...verifiedSet.images[0]!, verification: { ...verifiedSet.images[0]!.verification, checks: { ...verifiedSet.images[0]!.verification.checks, colour: false } } }],
    };
    expect(isImageSetEligible(uncheckedColour, "verified-only")).toBe(false);
    expect(auditImageRegistry([verifiedSet]).filter((i) => i.imageSetId === verifiedSet.id)).toEqual([]);
  });

  it("rejected images never spawn under any policy", () => {
    const rejected = { ...verifiedSet, images: [{ ...verifiedSet.images[0]!, verification: { ...verifiedSet.images[0]!.verification, status: "rejected" as const } }] };
    expect(isImageSetEligible(rejected, "allow-pending")).toBe(false);
  });

  it("reports the current sourcing status honestly", () => {
    // No photographs have been sourced yet, so nothing is spawnable under the release policy.
    const verifiedCount = spawnableVariants("verified-only").length;
    const pending = auditImageRegistry().filter((i) => i.imageId).length;
    expect(verifiedCount + pending).toBeGreaterThanOrEqual(VARIANTS.length);
  });
});
