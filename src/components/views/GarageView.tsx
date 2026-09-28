"use client";

import { CONFIG } from "@/engine/config";
import { financeSummary } from "@/engine/finance";
import { garageUpgradeStatus, milestones } from "@/engine/progression";
import { useGame } from "../GameContext";
import type { Navigate } from "../Shell";
import { tutorialSteps } from "../tutorial";
import { Badge, Button, Card, EmptyState, Money, SectionTitle, Stat } from "../ui";
import { OwnedCarCard } from "./cards";

export function GarageView({ navigate }: { navigate: Navigate }) {
  const game = useGame((s) => s.game)!;
  const send = useGame((s) => s.send);
  const fin = financeSummary(game);
  const steps = tutorialSteps(game);
  const nextStep = steps.find((s) => !s.done);
  const upgrade = garageUpgradeStatus(game);
  const recent = [...game.events].reverse().slice(0, 6);

  return (
    <div className="space-y-5">
      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Cash" testId="stat-cash">
            <Money cents={fin.cashCents} />
          </Stat>
          <Stat label="Realised profit" hint={`${game.flips.length} flip${game.flips.length === 1 ? "" : "s"}`} testId="stat-profit">
            <Money cents={fin.realisedProfitCents} signed />
          </Stat>
          <Stat label="Inventory cost" hint="Spent on cars you own">
            <Money cents={fin.inventoryCostCents} />
          </Stat>
          <Stat label="Liquidation equity" hint="Cash + low estimates">
            <Money cents={fin.liquidationEquityCents} />
          </Stat>
        </div>
      </Card>

      {!game.tutorial.dismissed && (
        <Card className="border-accent/50 bg-accent/5" data-testid="tutorial">
          <SectionTitle
            action={
              <button className="text-xs font-semibold text-muted underline" onClick={() => send({ type: "dismissTutorial" })}>
                Hide guide
              </button>
            }
          >
            Your first flip
          </SectionTitle>
          <ol className="grid gap-1.5 sm:grid-cols-2">
            {steps.map((s, i) => (
              <li key={s.id} className={`flex gap-2 text-sm ${s.done ? "text-muted line-through" : ""}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${s.done ? "bg-good text-white" : "bg-ink/10"}`}>
                  {s.done ? "✓" : i + 1}
                </span>
                <span>{s.title}</span>
              </li>
            ))}
          </ol>
          {nextStep && (
            <p className="mt-3 text-sm">
              <strong>Next:</strong> {nextStep.hint}
            </p>
          )}
          {!nextStep && <p className="mt-3 text-sm font-semibold text-good">First flip complete — nicely done.</p>}
        </Card>
      )}

      <section>
        <SectionTitle
          action={
            <span className="text-xs text-muted">
              {game.owned.length}/{game.garageSpaces} spaces
            </span>
          }
        >
          Your garage
        </SectionTitle>
        {game.owned.length === 0 ? (
          <EmptyState>
            Your garage is empty.{" "}
            <button className="font-semibold text-ink underline" onClick={() => navigate({ view: "market" })}>
              Browse the market
            </button>
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {game.owned.map((id) => (
              <OwnedCarCard key={id} carId={id} onOpen={() => navigate({ view: "owned", carId: id })} />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Card>
          <SectionTitle>Progress</SectionTitle>
          <div className="mb-3 flex items-center gap-3 text-sm">
            <Badge tone={game.reputation >= 0 ? "good" : "bad"}>Reputation {game.reputation}</Badge>
            {game.premiumUnlocked && <Badge tone="accent">Premium stock</Badge>}
          </div>
          <ul className="space-y-1.5 text-sm">
            {milestones(game).map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-2">
                <span className={m.done ? "text-muted line-through" : ""}>{m.label}</span>
                <span className="shrink-0 text-xs text-muted">{m.done ? "✓" : m.progress}</span>
              </li>
            ))}
          </ul>
          {game.garageSpaces < CONFIG.maxGarageSpaces && (
            <Button
              className="mt-3 w-full"
              variant="secondary"
              disabled={!upgrade.available}
              onClick={() => send({ type: "upgradeGarage" })}
              title={upgrade.reason ?? undefined}
            >
              <span>
                Rent a third space (<Money cents={CONFIG.garageUpgrade.cost} />)
              </span>
            </Button>
          )}
          {!upgrade.available && game.garageSpaces < CONFIG.maxGarageSpaces && <p className="mt-1 text-xs text-muted">{upgrade.reason}</p>}
        </Card>

        <Card>
          <SectionTitle>Short on cash?</SectionTitle>
          <p className="text-sm text-ink-soft">
            Spend the rest of today detailing cars for a mate: <Money cents={CONFIG.sideJob.payPerAp} /> per action point left.
          </p>
          <Button
            className="mt-3 w-full"
            variant="secondary"
            disabled={game.actionPoints < CONFIG.sideJob.minAp}
            onClick={() => send({ type: "sideJob" })}
            data-testid="side-job"
          >
            <span>
              Take a side job (+<Money cents={game.actionPoints * CONFIG.sideJob.payPerAp} />)
            </span>
          </Button>
          <p className="mt-2 text-xs text-muted">Stuck with a bad car? Open it and sell it to a wholesaler for a quick exit.</p>
        </Card>
      </section>

      <section>
        <SectionTitle>Recent activity</SectionTitle>
        <Card className="p-0">
          <ul className="divide-y divide-line text-sm">
            {recent.map((e) => (
              <li key={e.id} className="flex gap-2 px-4 py-2">
                <span className="w-12 shrink-0 text-xs text-muted">Day {e.day}</span>
                <span className={e.tone === "bad" ? "text-bad" : e.tone === "good" ? "text-good" : ""}>{e.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
