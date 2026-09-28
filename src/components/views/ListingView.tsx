"use client";

import { useState } from "react";
import { getFaultType, typicalRepairCents } from "@/engine/catalogue/faults";
import { getModification } from "@/engine/catalogue/modifications";
import { CONFIG } from "@/engine/config";
import { QUESTIONS } from "@/engine/inspection";
import { formatMoney, parseDollars, roundTo } from "@/engine/money";
import type { Car, InspectionMethod, QuestionId } from "@/engine/state";
import { CarImage } from "../CarImage";
import { useGame } from "../GameContext";
import type { Navigate } from "../Shell";
import { Badge, Button, Card, Money, MoneyInput, SectionTitle } from "../ui";
import { CarHeadline, EstimateLine, estimateFor } from "./cards";

const INSPECTIONS: { method: Exclude<InspectionMethod, "diagnosis">; label: string; blurb: string }[] = [
  { method: "visual", label: "Visual inspection", blurb: "Walk around the car. Spots body damage, tyres, leaks." },
  { method: "testDrive", label: "Test drive", blurb: "Reveals symptoms, but not their cause." },
  { method: "ppi", label: "Pre-purchase inspection", blurb: "A mobile mechanic confirms faults and checks the logbook." },
];

const SOURCE_LABELS: Record<string, string> = { visual: "visual inspection", testDrive: "test drive", ppi: "PPI", diagnosis: "workshop diagnosis" };

const SERVICE_LABELS: Record<string, string> = {
  unknown: "Not verified",
  "logbook-sighted": "Full logbook sighted",
  "partial-records": "Partial records only",
  "no-records": "No records",
  "workshop-service": "Fresh workshop service",
};

export function ListingView({ carId, navigate }: { carId: string; navigate: Navigate }) {
  const game = useGame((s) => s.game)!;
  const car = game.cars[carId];
  if (!car || car.status === "gone" || !game.marketplace.includes(carId)) {
    return (
      <div className="space-y-3">
        <BackButton onClick={() => navigate({ view: "market" })} />
        <Card>This listing is no longer available.</Card>
      </div>
    );
  }
  const est = estimateFor(game, car);
  const daysLeft = car.listing.expiresDay - game.day;

  return (
    <div className="space-y-4" data-testid="listing-view">
      <BackButton onClick={() => navigate({ view: "market" })} />
      <CarImage imageSetId={car.imageSetId} size="lg" />
      <div className="flex items-start justify-between gap-3">
        <CarHeadline car={car} />
        <div className="text-right">
          <div className="text-2xl font-black" data-testid="asking-price">
            <Money cents={car.seller.currentAskCents} />
          </div>
          <div className="text-xs text-muted">{daysLeft <= 0 ? "Last day" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}</div>
        </div>
      </div>

      <Card>
        <SectionTitle>Seller&apos;s ad · {car.seller.name}</SectionTitle>
        <p className="text-sm italic text-ink-soft">&ldquo;{car.listing.description}&rdquo;</p>
      </Card>

      <Card>
        <EstimateLine estimate={est} />
        {est.caveats.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-xs text-muted">
            {est.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
      </Card>

      <KnowledgePanel car={car} />
      <InspectPanel car={car} />
      <QuestionsPanel car={car} />
      <NegotiationPanel car={car} />
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-sm font-semibold text-ink-soft">
      ← Back
    </button>
  );
}

export function KnowledgePanel({ car }: { car: Car }) {
  const k = car.knowledge;
  const unexplained = k.symptoms.filter((s) => !k.confirmedFaults.some((f) => getFaultType(f.typeId).system === s.system));
  return (
    <Card data-testid="knowledge">
      <SectionTitle>What you know</SectionTitle>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs font-semibold text-muted">Confirmed faults</dt>
          <dd>
            {k.confirmedFaults.length === 0 ? (
              <span className="text-muted">None confirmed yet.</span>
            ) : (
              <ul className="space-y-1">
                {k.confirmedFaults.map((f) => (
                  <li key={f.faultId} className="flex flex-wrap items-center gap-2" data-testid="confirmed-fault">
                    <span className={f.repaired ? "line-through text-muted" : "font-medium"}>{getFaultType(f.typeId).name}</span>
                    <Badge tone={f.severity === "major" ? "bad" : f.severity === "moderate" ? "accent" : "neutral"}>{f.severity}</Badge>
                    {f.repaired ? (
                      <Badge tone="good">repaired</Badge>
                    ) : (
                      <span className="text-xs text-muted">
                        typical repair <Money cents={typicalRepairCents(f.typeId, f.severity)} />
                      </span>
                    )}
                    <span className="text-xs text-muted">· {f.source === "listing" ? "in the seller's ad" : f.source === "seller" ? "seller admitted" : `found by ${SOURCE_LABELS[f.source]}`}</span>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        {unexplained.length > 0 && (
          <div>
            <dt className="text-xs font-semibold text-muted">Unexplained symptoms</dt>
            <dd>
              <ul className="list-disc pl-5">
                {unexplained.map((s) => (
                  <li key={s.text}>{s.text}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        {k.claims.length > 0 && (
          <div>
            <dt className="text-xs font-semibold text-muted">Seller claims</dt>
            <dd>
              <ul className="space-y-1">
                {k.claims.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2">
                    <span>{c.text}</span>
                    <Badge tone={c.status === "confirmed" ? "good" : c.status === "contradicted" ? "bad" : "neutral"}>{c.status}</Badge>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <div>
            <dt className="text-xs font-semibold text-muted">Service history</dt>
            <dd>{SERVICE_LABELS[k.serviceEvidence]}</dd>
          </div>
          {k.discoveredModifications.length > 0 && (
            <div>
              <dt className="text-xs font-semibold text-muted">Modifications</dt>
              <dd>{k.discoveredModifications.map((m) => getModification(m).name).join(", ")}</dd>
            </div>
          )}
        </div>
        {k.notes.length > 0 && (
          <div>
            <dt className="text-xs font-semibold text-muted">Inspection notes</dt>
            <dd>
              <ul className="space-y-1 text-xs text-ink-soft">
                {k.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>
    </Card>
  );
}

function InspectPanel({ car }: { car: Car }) {
  const game = useGame((s) => s.game)!;
  const send = useGame((s) => s.send);
  const blocked = car.seller.status === "walked-away";
  return (
    <Card>
      <SectionTitle>Inspect</SectionTitle>
      <div className="grid gap-2 sm:grid-cols-3">
        {INSPECTIONS.map((i) => {
          const done = car.knowledge.inspections.some((x) => x.method === i.method);
          const cfg = CONFIG.inspections[i.method];
          return (
            <button
              key={i.method}
              disabled={done || blocked || game.actionPoints < cfg.ap || game.cash < cfg.cost}
              onClick={() => send({ type: "inspect", carId: car.id, method: i.method })}
              className="rounded-lg border border-line p-3 text-left transition-colors hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={`inspect-${i.method}`}
            >
              <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                {i.label}
                {done && <Badge tone="good">Done</Badge>}
              </div>
              <div className="mt-1 text-xs text-muted">{i.blurb}</div>
              <div className="mt-2 text-xs font-semibold">
                {cfg.ap} AP{cfg.cost > 0 ? ` · ${formatMoney(cfg.cost)}` : " · free"}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function QuestionsPanel({ car }: { car: Car }) {
  const send = useGame((s) => s.send);
  const blocked = car.seller.status === "walked-away";
  return (
    <Card>
      <SectionTitle>Ask the seller</SectionTitle>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(QUESTIONS) as QuestionId[]).map((q) => {
          const asked = car.seller.questionsAsked.includes(q);
          return (
            <Button
              key={q}
              size="sm"
              variant="secondary"
              disabled={asked || blocked}
              onClick={() => send({ type: "askQuestion", carId: car.id, question: q })}
              data-testid={`ask-${q}`}
            >
              {asked ? "✓ " : ""}
              {QUESTIONS[q]}
            </Button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">Answers are recorded as claims. Honest sellers can still be wrong about what they don&apos;t know.</p>
    </Card>
  );
}

function moodLabel(car: Car): { text: string; tone: "good" | "accent" | "bad" | "neutral" } {
  const s = car.seller;
  if (s.status === "walked-away") return { text: "Stopped replying", tone: "bad" };
  if (s.status === "agreed") return { text: "Deal agreed", tone: "good" };
  const ratio = s.patience / s.maxPatience;
  if (ratio > 0.66) return { text: "Relaxed", tone: "good" };
  if (ratio > 0.34) return { text: "Getting impatient", tone: "accent" };
  return { text: "About to walk away", tone: "bad" };
}

function NegotiationPanel({ car }: { car: Car }) {
  const game = useGame((s) => s.game)!;
  const send = useGame((s) => s.send);
  const s = car.seller;
  const [offer, setOffer] = useState(() => String(roundTo(s.currentAskCents * 0.85, 10000) / 100));
  const mood = moodLabel(car);
  const cents = parseDollars(offer);
  const raisable = car.knowledge.confirmedFaults.filter((f) => !f.repaired && !s.concessionsUsed.includes(f.faultId) && f.source !== "listing");

  return (
    <Card data-testid="negotiation">
      <SectionTitle action={<Badge tone={mood.tone}>{mood.text}</Badge>}>Negotiate</SectionTitle>
      {s.offers.length > 0 && (
        <ol className="mb-3 space-y-2" aria-label="Negotiation history">
          {s.offers.map((o, i) => (
            <li key={i} className={`flex ${o.by === "player" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${o.by === "player" ? "bg-ink text-white" : "bg-ink/5"}`}>
                {o.by === "player" ? `I'll offer ${formatMoney(o.amountCents)}.` : o.message}
              </div>
            </li>
          ))}
        </ol>
      )}

      {s.status === "open" && (
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <MoneyInput label={`Your offer (asking ${formatMoney(s.currentAskCents)})`} value={offer} onChange={setOffer} testId="offer-input" />
            </div>
            <Button disabled={cents === null} onClick={() => cents !== null && send({ type: "makeOffer", carId: car.id, amountCents: cents })} data-testid="make-offer">
              Offer
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {[0.85, 0.92].map((f) => (
              <Button key={f} size="sm" variant="ghost" onClick={() => setOffer(String(roundTo(s.currentAskCents * f, 5000) / 100))}>
                {Math.round((1 - f) * 100)}% under
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setOffer(String(s.currentAskCents / 100))} data-testid="offer-asking">
              Asking price
            </Button>
          </div>
          {(raisable.length > 0 || !s.concessionsUsed.includes("dialogue:cash-ready")) && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              {raisable.map((f) => (
                <Button
                  key={f.faultId}
                  size="sm"
                  variant="secondary"
                  onClick={() => send({ type: "presentEvidence", carId: car.id, faultId: f.faultId })}
                  data-testid="raise-fault"
                >
                  Point out: {getFaultType(f.typeId).name.toLowerCase()}
                </Button>
              ))}
              {!s.concessionsUsed.includes("dialogue:cash-ready") && (
                <Button size="sm" variant="secondary" onClick={() => send({ type: "dialogue", carId: car.id, option: "cash-ready" })}>
                  &ldquo;I can pay cash today&rdquo;
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {s.status === "agreed" && s.agreed && <BuyPanel car={car} />}
      {s.status === "walked-away" && <p className="text-sm text-bad">The seller has stopped replying. Other listings are waiting.</p>}
      {s.status === "open" && game.owned.length >= game.garageSpaces && (
        <p className="mt-2 text-xs text-bad">Your garage is full — you&apos;ll need a free space to buy.</p>
      )}
    </Card>
  );
}

function BuyPanel({ car }: { car: Car }) {
  const game = useGame((s) => s.game)!;
  const send = useGame((s) => s.send);
  const agreed = car.seller.agreed!;
  const total = agreed.amountCents + CONFIG.acquisitionFee;
  const full = game.owned.length >= game.garageSpaces;
  return (
    <div className="space-y-2 rounded-lg bg-good/5 p-3" data-testid="buy-panel">
      <div className="flex justify-between text-sm">
        <span>Agreed price</span>
        <Money cents={agreed.amountCents} />
      </div>
      <div className="flex justify-between text-sm">
        <span>Transfer &amp; PPSR check</span>
        <Money cents={CONFIG.acquisitionFee} />
      </div>
      <div className="flex justify-between border-t border-line pt-2 text-sm font-bold">
        <span>Total</span>
        <Money cents={total} />
      </div>
      <div className="flex justify-between text-xs text-muted">
        <span>Cash afterwards</span>
        <Money cents={game.cash - total} />
      </div>
      <p className="text-xs text-muted">Price held until the end of day {agreed.expiresDay}. Buying takes 1 action point.</p>
      <Button
        variant="good"
        className="w-full"
        disabled={full || game.cash < total || game.actionPoints < CONFIG.purchaseAp}
        onClick={() => send({ type: "buy", carId: car.id })}
        data-testid="buy"
      >
        Buy for <Money cents={total} />
      </Button>
    </div>
  );
}
