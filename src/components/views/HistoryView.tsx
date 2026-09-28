"use client";

import { financeSummary } from "@/engine/finance";
import type { LedgerKind } from "@/engine/state";
import { useGame } from "../GameContext";
import { Badge, Card, EmptyState, Money, SectionTitle } from "../ui";

const KIND_LABELS: Record<LedgerKind, string> = {
  purchase: "Purchase",
  "acquisition-fee": "Transfer fee",
  inspection: "Inspection",
  repair: "Repair",
  detail: "Detail",
  service: "Service",
  diagnosis: "Diagnosis",
  holding: "Holding",
  sale: "Sale",
  wholesale: "Wholesale",
  "side-job": "Side job",
  "garage-upgrade": "Garage",
};

export function HistoryView() {
  const game = useGame((s) => s.game)!;
  const fin = financeSummary(game);
  const flips = [...game.flips].reverse();
  const ledger = [...game.ledger].reverse().slice(0, 80);

  return (
    <div className="space-y-5">
      <Card className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <div className="text-xs text-muted">Realised profit</div>
          <Money cents={fin.realisedProfitCents} signed className="text-lg font-bold" />
        </div>
        <div>
          <div className="text-xs text-muted">Scouting costs</div>
          <Money cents={fin.scoutingCostCents} className="text-lg font-bold" />
          <div className="text-xs text-muted">Inspections on cars you passed on</div>
        </div>
        <div>
          <div className="text-xs text-muted">Side-job income</div>
          <Money cents={fin.otherIncomeCents} className="text-lg font-bold" />
        </div>
        <div>
          <div className="text-xs text-muted">Starting cash</div>
          <Money cents={game.startingCash} className="text-lg font-bold" />
        </div>
      </Card>

      <section>
        <SectionTitle>Completed flips</SectionTitle>
        {flips.length === 0 ? (
          <EmptyState>No flips yet. Every sale appears here with a full cost breakdown.</EmptyState>
        ) : (
          <div className="space-y-3">
            {flips.map((f) => (
              <Card key={f.carId} data-testid="flip-record">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold">{f.title}</div>
                    <div className="text-xs text-muted">
                      Day {f.boughtDay} → {f.soldDay} · {f.channel === "wholesale" ? "wholesale" : "private sale"}
                      {f.channel === "private" && !f.honest && " · undisclosed faults"}
                    </div>
                  </div>
                  <Money cents={f.profitCents} signed className="text-lg font-black" />
                </div>
                <table className="mt-2 w-full text-sm">
                  <tbody className="tabular">
                    {[
                      ["Purchase", f.purchaseCents],
                      ["Acquisition fee", f.acquisitionCents],
                      ["Inspections", f.inspectionCents],
                      ["Repairs", f.repairCents],
                      ["Detailing", f.detailCents],
                      ["Servicing", f.otherCents],
                      ["Holding costs", f.holdingCents],
                    ]
                      .filter(([, v]) => (v as number) > 0)
                      .map(([label, v]) => (
                        <tr key={label as string}>
                          <td className="text-muted">{label}</td>
                          <td className="text-right">
                            <Money cents={v as number} />
                          </td>
                        </tr>
                      ))}
                    <tr className="border-t border-line font-semibold">
                      <td>Total cost</td>
                      <td className="text-right">
                        <Money cents={f.totalCostCents} />
                      </td>
                    </tr>
                    <tr className="font-semibold">
                      <td>Sale</td>
                      <td className="text-right">
                        <Money cents={f.saleCents} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Ledger</SectionTitle>
        <Card className="p-0">
          {ledger.length === 0 ? (
            <p className="p-4 text-sm text-muted">No transactions yet.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {ledger.map((e) => (
                <li key={e.id} className="flex items-center gap-2 px-4 py-2">
                  <span className="w-12 shrink-0 text-xs text-muted">Day {e.day}</span>
                  <Badge>{KIND_LABELS[e.kind]}</Badge>
                  <span className="min-w-0 flex-1 truncate">{e.memo}</span>
                  <Money cents={e.amountCents} signed />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
