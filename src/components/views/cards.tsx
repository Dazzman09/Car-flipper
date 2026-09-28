"use client";

import { getVariant, variantDescriptor } from "@/engine/catalogue/variants";
import { getImageSet } from "@/engine/catalogue/images";
import { costBasisCents } from "@/engine/finance";
import { carTitle } from "@/engine/generation";
import { playerView } from "@/engine/market";
import type { Car, GameState } from "@/engine/state";
import { estimateResale, type ResaleEstimate } from "@/engine/valuation";
import { CarImage } from "../CarImage";
import { useGame } from "../GameContext";
import { Badge, Card, Money } from "../ui";

export function titleFor(car: Car): string {
  return carTitle(car, getVariant(car.variantId));
}

export function estimateFor(game: GameState, car: Car): ResaleEstimate {
  return estimateResale(playerView(game, car));
}

export function CarHeadline({ car }: { car: Car }) {
  const variant = getVariant(car.variantId);
  const colour = getImageSet(car.imageSetId).colour;
  return (
    <div className="min-w-0">
      <h3 className="truncate font-bold">{titleFor(car)}</h3>
      <p className="truncate text-xs text-muted">
        {car.odometerKm.toLocaleString("en-AU")} km · {colour.name} · {variantDescriptor(variant)}
      </p>
    </div>
  );
}

export function EstimateLine({ estimate, label = "Your resale estimate" }: { estimate: ResaleEstimate; label?: string }) {
  const tone = estimate.confidence === "high" ? "good" : estimate.confidence === "medium" ? "info" : "neutral";
  return (
    <div className="text-sm">
      <div className="flex items-center gap-2 text-xs text-muted">
        {label} <Badge tone={tone}>{estimate.confidence} confidence</Badge>
      </div>
      <div className="font-semibold">
        <Money cents={estimate.lowCents} /> – <Money cents={estimate.highCents} />{" "}
        <span className="text-xs font-normal text-muted">
          (likely <Money cents={estimate.likelyCents} />)
        </span>
      </div>
    </div>
  );
}

export function ListingCard({ car, onOpen }: { car: Car; onOpen: () => void }) {
  const game = useGame((s) => s.game)!;
  const est = estimateFor(game, car);
  const s = car.seller;
  const daysLeft = car.listing.expiresDay - game.day;
  const affordable = s.currentAskCents <= game.cash;
  return (
    <button onClick={onOpen} className="block w-full text-left" data-testid="listing-card" data-car-id={car.id}>
      <Card className="flex gap-3 p-3 transition-shadow hover:shadow-md">
        <div className="w-32 shrink-0 sm:w-40">
          <CarImage imageSetId={car.imageSetId} size="sm" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <CarHeadline car={car} />
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className={`text-lg font-black ${affordable ? "" : "text-muted"}`}>
              <Money cents={s.currentAskCents} />
            </span>
            {s.currentAskCents < car.listing.askingCents && (
              <span className="text-xs text-muted line-through">
                <Money cents={car.listing.askingCents} />
              </span>
            )}
          </div>
          <div className="text-xs text-muted">
            Est. <Money cents={est.lowCents} />–<Money cents={est.highCents} />
          </div>
          <div className="flex flex-wrap gap-1">
            {s.status === "agreed" && <Badge tone="good">Deal agreed</Badge>}
            {s.status === "walked-away" && <Badge tone="bad">Seller gone quiet</Badge>}
            {car.knowledge.inspections.length > 0 && <Badge tone="info">Inspected</Badge>}
            {car.knowledge.confirmedFaults.length > 0 && <Badge tone="bad">{car.knowledge.confirmedFaults.length} known fault(s)</Badge>}
            {daysLeft <= 1 && <Badge tone="accent">Ending soon</Badge>}
            {!affordable && <Badge>Over budget</Badge>}
          </div>
        </div>
      </Card>
    </button>
  );
}

export function OwnedCarCard({ carId, onOpen }: { carId: string; onOpen: () => void }) {
  const game = useGame((s) => s.game)!;
  const car = game.cars[carId];
  if (!car) return null;
  const est = estimateFor(game, car);
  const jobs = game.jobs.filter((j) => j.carId === carId && j.status === "in-progress");
  const listing = game.saleListings[carId];
  const offers = Object.values(game.buyers).filter((b) => b.carId === carId && b.status === "offered");
  return (
    <button onClick={onOpen} className="block w-full text-left" data-testid="owned-card" data-car-id={carId}>
      <Card className="space-y-2 p-3 transition-shadow hover:shadow-md">
        <CarImage imageSetId={car.imageSetId} size="sm" />
        <CarHeadline car={car} />
        <div className="flex justify-between text-sm">
          <span className="text-muted">Spent</span>
          <Money cents={costBasisCents(game, carId)} />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">Likely resale</span>
          <Money cents={est.likelyCents} />
        </div>
        <div className="flex flex-wrap gap-1">
          {jobs.length > 0 && <Badge tone="info">In workshop until day {Math.max(...jobs.map((j) => j.completionDay))}</Badge>}
          {listing?.status === "active" && <Badge tone="accent">Advertised</Badge>}
          {offers.length > 0 && <Badge tone="good">{offers.length} offer(s)</Badge>}
        </div>
      </Card>
    </button>
  );
}
