import { getFaultType } from "./catalogue/faults";
import { CONFIG } from "./config";
import { activeJobsFor, emit, fail, nextId, post, requireOwnedCar, titleOf } from "./core";
import { inspect } from "./inspection";
import { formatMoney, type Cents } from "./money";
import type { Car, GameEvent, GameState, JobKind, PublicCarView } from "./state";
import { estimateResale } from "./valuation";
import { playerView } from "./market";

export interface JobQuote {
  kind: JobKind;
  faultId: string | null;
  label: string;
  fixes: string;
  costCents: Cents;
  days: number;
  completionDay: number;
  /** Change in the player's likely resale estimate, or null when it can't be known in advance. */
  resaleBenefitCents: Cents | null;
  cashAfterCents: Cents;
  available: boolean;
  unavailableReason: string | null;
}

function hasJobHistory(state: GameState, carId: string, kind: JobKind): boolean {
  return state.jobs.some((j) => j.carId === carId && j.kind === kind);
}

function benefit(before: PublicCarView, after: PublicCarView): Cents {
  return estimateResale(after).likelyCents - estimateResale(before).likelyCents;
}

/** Everything the player needs to decide on a job, computed from their own knowledge. */
export function quoteJob(state: GameState, carId: string, kind: JobKind, faultId: string | null = null): JobQuote {
  const car = requireOwnedCar(state, carId);
  const view = playerView(state, car);
  let label: string;
  let fixes: string;
  let costCents: Cents;
  let days: number;
  let resaleBenefitCents: Cents | null = null;
  let unavailableReason: string | null = null;

  switch (kind) {
    case "repair": {
      const confirmed = car.knowledge.confirmedFaults.find((f) => f.faultId === faultId);
      if (!confirmed) fail("Only confirmed faults can be repaired.");
      const actual = car.truth.faults.find((f) => f.id === faultId);
      if (!actual) fail("Unknown fault.");
      const type = getFaultType(actual.typeId);
      label = `Repair: ${type.name}`;
      fixes = `Fixes the ${type.name.toLowerCase()} (${actual.severity}). Does not affect anything else.`;
      costCents = actual.repairCents;
      days = type.severities[actual.severity]!.repairDays;
      if (confirmed.repaired) unavailableReason = "Already repaired.";
      else if (activeJobsFor(state, carId).some((j) => j.faultId === faultId)) unavailableReason = "Already booked.";
      resaleBenefitCents = benefit(view, {
        ...view,
        knowledge: {
          ...view.knowledge,
          confirmedFaults: view.knowledge.confirmedFaults.map((f) => (f.faultId === faultId ? { ...f, repaired: true } : f)),
        },
      });
      break;
    }
    case "detail": {
      label = "Professional detail";
      fixes = "Improves presentation (paint, interior, engine bay). Does not fix mechanical faults.";
      costCents = CONFIG.detail.cost;
      days = CONFIG.detail.days;
      const newPresentation = Math.min(CONFIG.detail.maxPresentation, view.presentation + CONFIG.detail.presentationGain);
      if (hasJobHistory(state, carId, "detail")) unavailableReason = "Already detailed.";
      else if (newPresentation <= view.presentation) unavailableReason = "Already presented as well as a detail can manage.";
      resaleBenefitCents = benefit(view, { ...view, presentation: newPresentation });
      break;
    }
    case "service": {
      label = "Logbook service";
      fixes = "Fresh oil, filters and a stamped receipt buyers can see. Does not repair faults.";
      costCents = CONFIG.service.cost;
      days = CONFIG.service.days;
      if (hasJobHistory(state, carId, "service")) unavailableReason = "Already serviced.";
      const evidence = view.knowledge.serviceEvidence === "logbook-sighted" ? "logbook-sighted" : "workshop-service";
      resaleBenefitCents = benefit(view, { ...view, knowledge: { ...view.knowledge, serviceEvidence: evidence } });
      break;
    }
    case "diagnosis": {
      label = "Workshop diagnosis";
      fixes = "A mechanic goes over the whole car. Confirms faults; repairs are booked separately.";
      costCents = CONFIG.inspections.diagnosis.cost;
      days = CONFIG.inspections.diagnosis.days;
      if (car.knowledge.inspections.some((i) => i.method === "diagnosis") || hasJobHistory(state, carId, "diagnosis")) {
        unavailableReason = "Already diagnosed.";
      }
      break;
    }
  }

  if (!unavailableReason && state.saleListings[carId]?.status === "active") {
    unavailableReason = "Withdraw the advert before booking workshop work.";
  }
  if (!unavailableReason && state.cash < costCents) unavailableReason = "Not enough cash.";

  return {
    kind,
    faultId,
    label,
    fixes,
    costCents,
    days,
    completionDay: state.day + days,
    resaleBenefitCents,
    cashAfterCents: state.cash - costCents,
    available: unavailableReason === null,
    unavailableReason,
  };
}

export function bookJob(state: GameState, carId: string, kind: JobKind, faultId: string | null, events: GameEvent[]): void {
  const quote = quoteJob(state, carId, kind, faultId);
  if (!quote.available) fail(quote.unavailableReason ?? "That job isn't available.");
  const car = state.cars[carId]!;
  post(state, kind, -quote.costCents, carId, `${quote.label} — ${titleOf(car)}`);
  state.jobs.push({
    id: nextId(state, "job"),
    carId,
    kind,
    faultId: kind === "repair" ? faultId : null,
    costCents: quote.costCents,
    bookedDay: state.day,
    completionDay: quote.completionDay,
    status: "in-progress",
  });
  emit(state, "info", `Booked: ${quote.label} on the ${titleOf(car)} for ${formatMoney(quote.costCents)}. Ready day ${quote.completionDay}.`, events);
}

function applyJob(state: GameState, car: Car, kind: JobKind, faultId: string | null, events: GameEvent[]) {
  switch (kind) {
    case "repair": {
      const fault = car.truth.faults.find((f) => f.id === faultId);
      if (fault) fault.repaired = true;
      for (const c of car.knowledge.confirmedFaults) if (c.faultId === faultId) c.repaired = true;
      emit(state, "good", `Repair finished on the ${titleOf(car)}: ${fault ? getFaultType(fault.typeId).name : "fault"} fixed.`, events);
      break;
    }
    case "detail":
      car.truth.presentation = Math.min(CONFIG.detail.maxPresentation, car.truth.presentation + CONFIG.detail.presentationGain);
      emit(state, "good", `The ${titleOf(car)} is back from the detailer looking sharp.`, events);
      break;
    case "service":
      car.knowledge.serviceEvidence = car.truth.serviceHistory === "full" ? "logbook-sighted" : "workshop-service";
      emit(state, "good", `The ${titleOf(car)} has been serviced. Receipt added to the glovebox.`, events);
      break;
    case "diagnosis":
      inspect(state, car.id, "diagnosis", events, { owned: true });
      break;
  }
}

/** Complete every job due by the current day. Each job is applied exactly once. */
export function completeDueJobs(state: GameState, events: GameEvent[]): void {
  for (const job of state.jobs) {
    if (job.status !== "in-progress" || job.completionDay > state.day) continue;
    job.status = "completed";
    const car = state.cars[job.carId];
    if (car) applyJob(state, car, job.kind, job.faultId, events);
  }
}
