"use client";

import { useState } from "react";
import { getFaultType } from "@/engine/catalogue/faults";
import { getModification } from "@/engine/catalogue/modifications";
import { CONFIG } from "@/engine/config";
import { costBasisCents } from "@/engine/finance";
import { formatMoney, parseDollars, roundTo } from "@/engine/money";
import { advertQuality, MAX_ADVERT_LENGTH, wholesaleEstimate } from "@/engine/selling";
import type { Buyer, Car, JobKind } from "@/engine/state";
import { quoteJob, type JobQuote } from "@/engine/workshop";
import { CarImage } from "../CarImage";
import { useGame } from "../GameContext";
import type { Navigate } from "../Shell";
import { Badge, Button, Card, Modal, Money, MoneyInput, SectionTitle } from "../ui";
import { CarHeadline, EstimateLine, estimateFor, titleFor } from "./cards";
import { KnowledgePanel } from "./ListingView";

export function OwnedCarView({ carId, navigate }: { carId: string; navigate: Navigate }) {
  const game = useGame((s) => s.game)!;
  const car = game.cars[carId];
  if (!car || car.status !== "owned") {
    return (
      <div className="space-y-3">
        <button onClick={() => navigate({ view: "garage" })} className="text-sm font-semibold text-ink-soft">
          ← Garage
        </button>
        <Card>You no longer own this car.</Card>
      </div>
    );
  }
  const est = estimateFor(game, car);
  const spent = costBasisCents(game, carId);
  const listing = game.saleListings[carId];
  const advertised = listing?.status === "active";

  return (
    <div className="space-y-4" data-testid="owned-view">
      <button onClick={() => navigate({ view: "garage" })} className="text-sm font-semibold text-ink-soft">
        ← Garage
      </button>
      <CarImage imageSetId={car.imageSetId} size="lg" />
      <CarHeadline car={car} />
      <Card className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-muted">Spent so far</div>
          <div className="text-lg font-bold">
            <Money cents={spent} />
          </div>
          <div className="text-xs text-muted">Holding costs {formatMoney(CONFIG.holdingCostPerCarPerDay)}/day</div>
        </div>
        <EstimateLine estimate={est} label="Resale estimate" />
        <div className="col-span-2 text-sm">
          Likely profit at estimate:{" "}
          <Money cents={est.likelyCents - spent} signed className="font-bold" />
        </div>
      </Card>

      <KnowledgePanel car={car} />
      {!advertised && <WorkshopPanel car={car} />}
      {advertised ? <OffersPanel car={car} /> : <AdvertEditor car={car} />}
      <WholesalePanel car={car} />
    </div>
  );
}

function WorkshopPanel({ car }: { car: Car }) {
  const game = useGame((s) => s.game)!;
  const send = useGame((s) => s.send);
  const active = game.jobs.filter((j) => j.carId === car.id && j.status === "in-progress");
  const quotes: JobQuote[] = [
    ...car.knowledge.confirmedFaults.filter((f) => !f.repaired).map((f) => quoteJob(game, car.id, "repair", f.faultId)),
    quoteJob(game, car.id, "detail"),
    quoteJob(game, car.id, "service"),
    quoteJob(game, car.id, "diagnosis"),
  ];
  return (
    <Card data-testid="workshop">
      <SectionTitle>Workshop</SectionTitle>
      {active.length > 0 && (
        <ul className="mb-3 space-y-1 rounded-lg bg-info/5 p-3 text-sm">
          {active.map((j) => (
            <li key={j.id} className="flex justify-between gap-2">
              <span>
                {j.kind === "repair" && j.faultId
                  ? `Repair: ${getFaultType(car.knowledge.confirmedFaults.find((f) => f.faultId === j.faultId)?.typeId ?? "worn-tyres").name}`
                  : { detail: "Professional detail", service: "Logbook service", diagnosis: "Workshop diagnosis", repair: "Repair" }[j.kind]}
              </span>
              <span className="text-muted">ready day {j.completionDay}</span>
            </li>
          ))}
        </ul>
      )}
      <ul className="space-y-2">
        {quotes.map((q) => (
          <li key={`${q.kind}-${q.faultId ?? ""}`} className="rounded-lg border border-line p-3" data-testid={`job-${q.kind}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">{q.label}</div>
                <div className="text-xs text-muted">{q.fixes}</div>
              </div>
              <div className="shrink-0 text-right font-bold">
                <Money cents={q.costCents} />
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-muted">Ready</div>Day {q.completionDay}
              </div>
              <div>
                <div className="text-muted">Resale benefit</div>
                {q.resaleBenefitCents === null ? "Narrows estimate" : <Money cents={q.resaleBenefitCents} signed />}
              </div>
              <div>
                <div className="text-muted">Cash after</div>
                <Money cents={q.cashAfterCents} />
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              {q.unavailableReason ? <span className="text-xs text-muted">{q.unavailableReason}</span> : <span />}
              <Button
                size="sm"
                variant="secondary"
                disabled={!q.available}
                onClick={() => send({ type: "bookJob", carId: car.id, kind: q.kind as JobKind, faultId: q.faultId })}
                data-testid={`book-${q.kind}`}
              >
                Book
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">Jobs are paid upfront. Professional repairs fix exactly the fault quoted — nothing else.</p>
    </Card>
  );
}

function AdvertEditor({ car }: { car: Car }) {
  const game = useGame((s) => s.game)!;
  const send = useGame((s) => s.send);
  const est = estimateFor(game, car);
  const busy = game.jobs.some((j) => j.carId === car.id && j.status === "in-progress");
  const unrepaired = car.knowledge.confirmedFaults.filter((f) => !f.repaired);
  const [price, setPrice] = useState(() => String(roundTo(est.likelyCents * 1.03, 10000) / 100));
  const [text, setText] = useState(
    () =>
      `${titleFor(car)}, ${car.odometerKm.toLocaleString("en-AU")} km. ` +
      `${car.knowledge.serviceEvidence === "logbook-sighted" ? "Full logbook service history. " : car.knowledge.serviceEvidence === "workshop-service" ? "Freshly serviced, receipt included. " : ""}` +
      "Drives well. Inspections and test drives welcome.",
  );
  const [faults, setFaults] = useState<string[]>(() => unrepaired.map((f) => f.faultId));
  const [mods, setMods] = useState<string[]>(() => [...car.knowledge.discoveredModifications]);
  const cents = parseDollars(price);
  const quality = advertQuality(text);
  const hiding = unrepaired.filter((f) => !faults.includes(f.faultId));

  return (
    <Card data-testid="advert-editor">
      <SectionTitle>Advertise for sale</SectionTitle>
      {busy && <p className="mb-2 text-sm text-muted">Wait for the workshop to finish before advertising.</p>}
      <div className="space-y-3">
        <MoneyInput label={`Asking price (likely ${formatMoney(est.likelyCents)})`} value={price} onChange={setPrice} testId="ad-price" />
        <label className="block">
          <span className="mb-1 flex justify-between text-xs font-medium text-muted">
            Advert text
            <span>
              Quality <strong className={quality >= 0.7 ? "text-good" : quality >= 0.45 ? "text-accent-strong" : "text-bad"}>{Math.round(quality * 100)}%</strong>
            </span>
          </span>
          <textarea
            className="h-28 w-full rounded-lg border border-line bg-card p-3 text-sm outline-none focus:border-ink"
            maxLength={MAX_ADVERT_LENGTH}
            value={text}
            onChange={(e) => setText(e.target.value)}
            data-testid="ad-text"
          />
          <span className="text-xs text-muted">Good ads mention kilometres, service history, rego and invite inspections.</span>
        </label>
        {(unrepaired.length > 0 || car.knowledge.discoveredModifications.length > 0) && (
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-muted">Disclose</legend>
            <div className="space-y-1">
              {unrepaired.map((f) => (
                <label key={f.faultId} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={faults.includes(f.faultId)}
                    onChange={(e) => setFaults((xs) => (e.target.checked ? [...xs, f.faultId] : xs.filter((x) => x !== f.faultId)))}
                  />
                  {getFaultType(f.typeId).name} ({f.severity})
                </label>
              ))}
              {car.knowledge.discoveredModifications.map((m) => (
                <label key={m} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={mods.includes(m)} onChange={(e) => setMods((xs) => (e.target.checked ? [...xs, m] : xs.filter((x) => x !== m)))} />
                  {getModification(m).name}
                </label>
              ))}
            </div>
            {hiding.length > 0 && (
              <p className="mt-2 rounded-md bg-bad/10 p-2 text-xs text-bad">
                You know about {hiding.length} fault(s) you&apos;re not disclosing. Buyers who find them will cut their offer or walk — and it costs reputation.
              </p>
            )}
          </fieldset>
        )}
        <Button
          className="w-full"
          disabled={busy || cents === null || game.actionPoints < CONFIG.listForSaleAp}
          onClick={() =>
            cents !== null &&
            send({ type: "listForSale", carId: car.id, askingCents: cents, advertText: text, disclosedFaultIds: faults, disclosedModificationIds: mods })
          }
          data-testid="list-for-sale"
        >
          Publish advert (1 AP)
        </Button>
        <p className="text-xs text-muted">Buyers respond overnight. Pricing well above your estimate brings fewer enquiries.</p>
      </div>
    </Card>
  );
}

function buyerLine(b: Buyer) {
  return { "test-drive": "Test drove it", "look-over": "Looked it over properly", mechanic: "Brought a mechanic" }[b.inspection];
}

function OffersPanel({ car }: { car: Car }) {
  const game = useGame((s) => s.game)!;
  const send = useGame((s) => s.send);
  const listing = game.saleListings[car.id]!;
  const [newPrice, setNewPrice] = useState(String(listing.askingCents / 100));
  const [counter, setCounter] = useState<Record<string, string>>({});
  const buyers = Object.values(game.buyers)
    .filter((b) => b.carId === car.id && b.offerDay >= listing.listedDay)
    .sort((a, b) => b.offerDay - a.offerDay || b.offerCents - a.offerCents);
  const open = buyers.filter((b) => b.status === "offered");
  const priceCents = parseDollars(newPrice);

  return (
    <Card data-testid="offers">
      <SectionTitle action={<Badge tone="accent">Advertised</Badge>}>Buyers</SectionTitle>
      <div className="mb-3 flex items-end gap-2">
        <div className="flex-1">
          <MoneyInput label="Asking price" value={newPrice} onChange={setNewPrice} />
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={priceCents === null || priceCents === listing.askingCents}
          onClick={() => priceCents !== null && send({ type: "updateAskingPrice", carId: car.id, askingCents: priceCents })}
        >
          Update
        </Button>
      </div>
      {open.length === 0 && <p className="text-sm text-muted">No open offers. Advance to the next day to hear from buyers.</p>}
      <ul className="space-y-2">
        {buyers.map((b) => {
          const isOpen = b.status === "offered";
          const cents = parseDollars(counter[b.id] ?? "");
          return (
            <li key={b.id} className={`rounded-lg border p-3 ${isOpen ? "border-line" : "border-transparent bg-ink/5 opacity-70"}`} data-testid="buyer-offer">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">
                    {b.name} <span className="text-xs font-normal text-muted">· {buyerLine(b)}</span>
                  </div>
                  <p className="text-sm text-ink-soft">&ldquo;{b.message}&rdquo;</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-lg font-black">
                    <Money cents={b.offerCents} />
                  </div>
                  <div className="text-xs text-muted">
                    {isOpen ? `until day ${b.expiresDay}` : b.status.replace("-", " ")}
                  </div>
                </div>
              </div>
              {isOpen && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <Button size="sm" variant="good" disabled={game.actionPoints < CONFIG.acceptOfferAp} onClick={() => send({ type: "acceptBuyerOffer", buyerId: b.id })} data-testid="accept-offer">
                    Accept (1 AP)
                  </Button>
                  {!b.countered && (
                    <>
                      <input
                        aria-label={`Counter-offer to ${b.name}`}
                        inputMode="decimal"
                        placeholder="Counter $"
                        className="w-28 rounded-md border border-line px-2 py-1.5 text-sm"
                        value={counter[b.id] ?? ""}
                        onChange={(e) => setCounter((c) => ({ ...c, [b.id]: e.target.value }))}
                      />
                      <Button size="sm" variant="secondary" disabled={cents === null} onClick={() => cents !== null && send({ type: "counterBuyerOffer", buyerId: b.id, amountCents: cents })}>
                        Counter
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => send({ type: "declineBuyerOffer", buyerId: b.id })}>
                    Decline
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Button className="mt-3" size="sm" variant="ghost" onClick={() => send({ type: "withdrawListing", carId: car.id })}>
        Withdraw advert
      </Button>
    </Card>
  );
}

function WholesalePanel({ car }: { car: Car }) {
  const game = useGame((s) => s.game)!;
  const send = useGame((s) => s.send);
  const [confirming, setConfirming] = useState(false);
  const busy = game.jobs.some((j) => j.carId === car.id && j.status === "in-progress");
  const range = wholesaleEstimate(game, car.id);
  return (
    <Card>
      <SectionTitle>Quick exit</SectionTitle>
      <p className="text-sm text-ink-soft">
        A wholesaler will take it today, no questions asked. They inspect it on arrival and pay on the spot — expect around{" "}
        <Money cents={range.lowCents} />–<Money cents={range.highCents} />.
      </p>
      <Button className="mt-2" variant="secondary" size="sm" disabled={busy || game.actionPoints < CONFIG.wholesaleAp} onClick={() => setConfirming(true)} data-testid="wholesale">
        Sell to wholesaler (1 AP)
      </Button>
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Sell to the wholesaler?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirming(false);
                send({ type: "sellToWholesaler", carId: car.id });
              }}
              data-testid="confirm-wholesale"
            >
              Sell now
            </Button>
          </>
        }
      >
        <p className="text-sm">
          The wholesaler pays what their own inspection says it&apos;s worth, well below private-sale prices. Any open buyer offers will be cancelled.
        </p>
      </Modal>
    </Card>
  );
}
