# Car Flipper Tycoon

A browser game about flipping used cars: browse listings, investigate, negotiate,
buy, repair, advertise, deal with buyers and sell — without getting burned by
what the seller didn't tell you.

Built with Next.js, React, TypeScript, Tailwind CSS, Zustand and Zod. The game
simulation is plain TypeScript in `src/engine`.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

Add `?seed=123` to the URL before starting a career for a reproducible world.

## Checks

```bash
npm run typecheck    # TypeScript
npm test             # Vitest: rules, saves, image registry, economy
npm run build        # production build
npm run test:e2e     # Playwright: desktop + portrait mobile (needs a build)
npm run verify       # all of the above
npm run simulate     # economy simulation report
npm run verify:images   # release gate for verified car photos
npm run verify:release  # verify + verify:images
```

`verify:images` currently fails: no car photographs have been sourced yet. See
[docs/IMAGE_SOURCING.md](docs/IMAGE_SOURCING.md). Until then the game shows a
labelled illustration generated from each car's image-set configuration.

## Docs

- [Implementation notes](docs/TECHNICAL_PLAN.md) — architecture, rules, economy, decisions
- [Image sourcing](docs/IMAGE_SOURCING.md) — workflow and acceptance checks for car photos
