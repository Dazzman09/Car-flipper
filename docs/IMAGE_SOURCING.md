# Vehicle image sourcing and verification

Accurate photographs are a **release requirement**: every spawnable car must show a
verified photograph that matches its make, model, generation, facelift, body
style, visible trim and modifications, colour and a documented compatible model
year.

## Current status

**No photographs have been sourced yet.** All 12 image sets in
`src/engine/catalogue/images.ts` are `pending`. Until a set is verified the game
draws a clearly labelled illustration from the same configuration (body style and
colour), so the picture can never contradict the listing. `npm run verify:images`
fails and will keep failing until every variant has a verified photo.

Sourcing could not be done in the build environment because its network policy
blocks `commons.wikimedia.org` and `upload.wikimedia.org`.

## How the generator guarantees a match

1. The generator picks a variant, then picks an **eligible image set** for it.
2. The car's colour, visible trim, visible modifications and model-year range
   are taken **from the image set**. The year is drawn from the intersection of
   the variant's production years and the set's `compatibleYears`.
3. Only hidden modifications (engine tune, exhaust, head unit) are added
   procedurally; visible modifications come only from the photo.
4. Under the `verified-only` policy (the release policy) only fully verified
   sets are eligible. Set `NEXT_PUBLIC_IMAGE_POLICY=verified-only` to enforce it
   in a build. Existing careers keep the policy they were started with.

`tests/generation.test.ts` generates thousands of cars and checks every one
against its image set.

## Sourcing workflow (per variant)

1. Search a source with per-file licensing, e.g. Wikimedia Commons categories such
   as `Category:Toyota Corolla (E170)`. Prefer an exterior front three-quarter
   photo in good light with no people or legible plates.
2. Open the file page and record: page URL, author/photographer, licence name and
   URL, and the exact attribution text the licence requires. Check every file
   individually; do not assume a category shares one licence.
3. Confirm each item below against the photo **and** a reliable reference (for
   example the manufacturer's brochure or an Australian review of that model
   year):

   | Check | What to confirm |
   |---|---|
   | `makeModel` | Badge and shape match the make and model |
   | `generation` | Correct generation (e.g. E170, not E210) |
   | `facelift` | Pre-facelift vs facelift lights, grille and bumpers |
   | `bodyStyle` | Sedan / hatch / wagon / SUV / ute / convertible |
   | `trim` | Visible trim cues: wheels, badges, lights, mirrors |
   | `modifications` | Any visible modifications are listed in `visibleModifications` |
   | `colour` | Colour name and hex match the photo |
   | `modelYear` | `compatibleYears` covers only years that look identical |

4. Download the file to `public/cars/<variant-id>--<colour>--front34.jpg`
   (self-host; don't hotlink), resized to about 1200 px wide.
5. Update the image set: set `src`, `source`, `photographer`, `licence`,
   `attribution`, every `checks` flag, `verifiedBy`, `verifiedOn`, and notes. If
   the best photo is a different colour from the placeholder, change the set's
   `colour` to match the photo — never the other way round.
6. Run `npm run verify:images` and `npm test`.

Extra angles can be added to a set once they are verified too. Reusing one
accurate photo across many procedural listings is acceptable. A photo that fails
review should be kept with status `rejected` for audit; rejected sets never spawn.

## Attribution in the game

The attribution text is shown under the photo on listing and garage screens and
listed in Settings → Vehicle images.
