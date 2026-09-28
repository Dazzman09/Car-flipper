"use client";

import { useState } from "react";
import { getVariant, type Segment } from "@/engine/catalogue/variants";
import { marketIndex } from "@/engine/market";
import { useGame } from "../GameContext";
import type { Navigate } from "../Shell";
import { EmptyState, SectionTitle } from "../ui";
import { ListingCard, estimateFor } from "./cards";

type Sort = "newest" | "price" | "value" | "ending";

const SEGMENT_LABELS: Record<Segment, string> = {
  light: "Light cars",
  small: "Small cars",
  medium: "Medium cars",
  large: "Large cars",
  suv: "SUVs",
  ute: "Utes",
  sports: "Sports cars",
};

export function MarketView({ navigate }: { navigate: Navigate }) {
  const game = useGame((s) => s.game)!;
  const [sort, setSort] = useState<Sort>("newest");
  const [affordableOnly, setAffordableOnly] = useState(false);
  let cars = game.marketplace.map((id) => game.cars[id]!).filter(Boolean);
  if (affordableOnly) cars = cars.filter((c) => c.seller.currentAskCents <= game.cash);
  const margin = (c: (typeof cars)[number]) => estimateFor(game, c).likelyCents - c.seller.currentAskCents;
  cars = [...cars].sort((a, b) => {
    if (sort === "price") return a.seller.currentAskCents - b.seller.currentAskCents;
    if (sort === "value") return margin(b) - margin(a);
    if (sort === "ending") return a.listing.expiresDay - b.listing.expiresDay;
    return b.listing.postedDay - a.listing.postedDay;
  });

  const segments = [...new Set(game.marketplace.map((id) => getVariant(game.cars[id]!.variantId).segment))];
  const movers = segments
    .map((seg) => ({ seg, index: marketIndex(game.worldSeed, seg, game.day) }))
    .sort((a, b) => Math.abs(b.index - 1) - Math.abs(a.index - 1))
    .slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Market conditions">
        <span className="font-semibold text-muted">This week:</span>
        {movers.map(({ seg, index }) => (
          <span key={seg} className={`rounded-full px-2 py-0.5 font-semibold ${index >= 1 ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>
            {SEGMENT_LABELS[seg]} {index >= 1 ? "+" : "−"}
            {Math.abs(Math.round((index - 1) * 100))}%
          </span>
        ))}
      </div>

      <SectionTitle
        action={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-muted">
              <input type="checkbox" checked={affordableOnly} onChange={(e) => setAffordableOnly(e.target.checked)} />
              Within budget
            </label>
            <select
              aria-label="Sort listings"
              className="rounded-md border border-line bg-card px-2 py-1 text-xs"
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
            >
              <option value="newest">Newest</option>
              <option value="price">Cheapest</option>
              <option value="value">Best apparent value</option>
              <option value="ending">Ending soon</option>
            </select>
          </div>
        }
      >
        {cars.length} listings
      </SectionTitle>
      {cars.length === 0 ? (
        <EmptyState>No listings match. New cars appear each day.</EmptyState>
      ) : (
        <div className="space-y-3">
          {cars.map((c) => (
            <ListingCard key={c.id} car={c} onOpen={() => navigate({ view: "listing", carId: c.id })} />
          ))}
        </div>
      )}
      <p className="text-xs text-muted">
        Estimates use only what you know. &ldquo;Best apparent value&rdquo; can hide expensive surprises — inspect before you buy.
      </p>
    </div>
  );
}
