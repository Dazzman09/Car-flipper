import { getFaultType } from "./catalogue/faults";
import { getModification } from "./catalogue/modifications";
import { CONFIG } from "./config";
import { emit, fail, post, requireCash, spendActionPoints, titleOf } from "./core";
import { formatMoney } from "./money";
import { rollFor } from "./rng";
import type { ActualFault, Car, GameEvent, GameState, InspectionMethod, QuestionId } from "./state";
import { serviceEvidenceFromHistory } from "./valuation";

export const QUESTIONS: Record<QuestionId, string> = {
  mechanical: "Are there any mechanical problems I should know about?",
  service: "What's the service history like?",
  accidents: "Has it been in an accident or had any body damage?",
  modifications: "Has it been modified at all?",
  reason: "Why are you selling it?",
};

const BODY_FAULTS = new Set(["panel-damage", "rust"]);

function sellerIsHonest(state: GameState, car: Car, topic: string): boolean {
  return rollFor(state.worldSeed, "honesty", car.id, topic) < car.seller.honesty;
}

function confirmFault(car: Car, fault: ActualFault, source: InspectionMethod | "seller", day: number): boolean {
  if (car.knowledge.confirmedFaults.some((c) => c.faultId === fault.id)) return false;
  car.knowledge.confirmedFaults.push({
    faultId: fault.id,
    typeId: fault.typeId,
    severity: fault.severity,
    source,
    day,
    repaired: fault.repaired,
  });
  // A confirmed fault contradicts earlier "no problems" claims about that topic.
  const topic = BODY_FAULTS.has(fault.typeId) ? "accidents" : "mechanical";
  for (const claim of car.knowledge.claims) {
    if (claim.topic === topic && claim.status === "unverified") claim.status = "contradicted";
  }
  return true;
}

/**
 * Seller questions. Each can be asked once per seller; the answer depends on
 * what the seller actually knows and whether they are honest about it, and is
 * stored as a claim or disclosure — it never changes the car itself.
 */
export function askQuestion(state: GameState, carId: string, question: QuestionId, events: GameEvent[]): string {
  const car = state.cars[carId];
  if (!car || car.status !== "listed") fail("That listing is no longer available.");
  const seller = car.seller;
  if (seller.status === "walked-away") fail(`${seller.name} has stopped replying to you.`);
  if (seller.questionsAsked.includes(question)) fail("You've already asked that.");
  seller.questionsAsked.push(question);
  const k = car.knowledge;
  const honest = sellerIsHonest(state, car, question);
  let answer: string;

  switch (question) {
    case "mechanical": {
      const known = car.truth.faults.filter((f) => f.sellerKnows && !f.repaired && !BODY_FAULTS.has(f.typeId));
      if (honest && known.length > 0) {
        for (const f of known) confirmFault(car, f, "seller", state.day);
        const hidden = known.filter((f) => !f.sellerDisclosed);
        const names = (list: typeof known) => list.map((f) => getFaultType(f.typeId).name.toLowerCase()).join(", ");
        answer = hidden.length
          ? `Honestly? ${names(hidden)}${hidden.length < known.length ? `, on top of what's in the ad` : ""}. I probably should have put that in the listing.`
          : `Just what's in the ad: ${names(known)}. That's reflected in the price.`;
      } else if (honest) {
        answer = "Not that I know of. It's always been reliable for me.";
        addClaim(car, "mechanical", "Seller knows of no mechanical problems.");
      } else {
        answer = "Nothing at all, it runs perfectly.";
        addClaim(car, "mechanical", "Seller says it runs perfectly.");
      }
      break;
    }
    case "service": {
      const h = car.truth.serviceHistory;
      if (honest || h === "full") {
        answer =
          h === "full"
            ? "Full logbook history, stamped every year."
            : h === "partial"
              ? "I've got some receipts but it missed a few services."
              : "I don't have any records, sorry.";
        addClaim(car, "service", `Seller: ${answer}`);
      } else {
        answer = "Always serviced on time. The book's somewhere at home.";
        addClaim(car, "service", "Seller says it has been serviced on time (no logbook shown).");
      }
      break;
    }
    case "accidents": {
      const known = car.truth.faults.filter((f) => f.sellerKnows && !f.repaired && BODY_FAULTS.has(f.typeId));
      if (honest && known.length > 0) {
        for (const f of known) confirmFault(car, f, "seller", state.day);
        answer = `There's some ${known.map((f) => getFaultType(f.typeId).name.toLowerCase()).join(" and ")}, you'll see it in person.`;
      } else {
        answer = "Never been hit.";
        addClaim(car, "accidents", "Seller says it has never been in an accident.");
      }
      break;
    }
    case "modifications": {
      const mods = car.truth.hiddenModifications;
      if (honest && mods.length > 0) {
        for (const m of mods) if (!k.discoveredModifications.includes(m)) k.discoveredModifications.push(m);
        answer = `Yeah, it has ${mods.map((m) => getModification(m).name.toLowerCase()).join(" and ")}.`;
      } else {
        answer = "Completely standard.";
        addClaim(car, "modifications", "Seller says the car is standard.");
      }
      break;
    }
    case "reason": {
      const u = seller.urgency;
      const tone = u > 0.7 ? "They sound keen to sell quickly." : u < 0.3 ? "They don't sound in any hurry." : "They seem open to a reasonable offer.";
      answer = `${seller.reason} ${tone}`;
      break;
    }
  }
  emit(state, "info", `${seller.name}: “${answer}”`, events);
  return answer;
}

function addClaim(car: Car, topic: "mechanical" | "service" | "accidents" | "modifications", text: string) {
  car.knowledge.claims.push({
    id: `${car.id}:claim:${topic}:${car.knowledge.claims.length}`,
    topic,
    text,
    source: "seller",
    status: "unverified",
  });
}

function recordServiceEvidence(car: Car) {
  if (car.knowledge.serviceEvidence === "workshop-service") return;
  car.knowledge.serviceEvidence = serviceEvidenceFromHistory(car.truth.serviceHistory);
  for (const claim of car.knowledge.claims) {
    if (claim.topic !== "service" || claim.status !== "unverified") continue;
    const claimsFull = /full|on time|every year/i.test(claim.text);
    const matches = claimsFull ? car.truth.serviceHistory === "full" : car.truth.serviceHistory !== "full";
    claim.status = matches ? "confirmed" : "contradicted";
  }
}

/**
 * Run an inspection. Results are deterministic per (career, car, method), and
 * each method can only be performed once per car, so outcomes cannot be
 * rerolled.
 */
export function inspect(
  state: GameState,
  carId: string,
  method: InspectionMethod,
  events: GameEvent[],
  opts: { owned?: boolean } = {},
): string[] {
  const car = state.cars[carId];
  if (!car) fail("That car no longer exists.");
  if (!opts.owned && car.status !== "listed") fail("That listing is no longer available.");
  if (method === "diagnosis" && !opts.owned) fail("Workshop diagnosis is only available for cars you own.");
  if (car.seller.status === "walked-away" && !opts.owned) fail(`${car.seller.name} won't let you see the car any more.`);
  const k = car.knowledge;
  if (k.inspections.some((i) => i.method === method)) fail("You've already done that inspection on this car.");

  if (!opts.owned) {
    const cfg = CONFIG.inspections[method as "visual" | "testDrive" | "ppi"];
    requireCash(state, cfg.cost, "the inspection");
    spendActionPoints(state, cfg.ap);
    if (cfg.cost > 0) post(state, "inspection", -cfg.cost, car.id, `Pre-purchase inspection: ${titleOf(car)}`);
  }
  k.inspections.push({ method, day: state.day });
  state.stats.inspections += 1;

  const findings: string[] = [];
  for (const fault of car.truth.faults) {
    if (fault.repaired) continue;
    const type = getFaultType(fault.typeId);
    const found = rollFor(state.worldSeed, "detect", fault.id, method) < type.detect[method];
    if (!found) continue;
    if (method === "testDrive") {
      if (type.symptom && !k.symptoms.some((s) => s.text === type.symptom)) {
        k.symptoms.push({ system: type.system, text: type.symptom, day: state.day });
        findings.push(`Symptom: ${type.symptom}.`);
      }
    } else if (method === "visual") {
      if (confirmFault(car, fault, method, state.day)) findings.push(`${type.visualCue ?? type.name}.`);
    } else if (confirmFault(car, fault, method, state.day)) {
      findings.push(`${type.name} (${fault.severity}).`);
    }
  }

  const mods = car.truth.hiddenModifications;
  for (const m of mods) {
    const mod = getModification(m);
    if (k.discoveredModifications.includes(m)) continue;
    if (rollFor(state.worldSeed, "detect-mod", car.id, m, method) < mod.detect[method]) {
      k.discoveredModifications.push(m);
      findings.push(`Modification: ${mod.name}.`);
      for (const claim of k.claims) if (claim.topic === "modifications") claim.status = "contradicted";
    }
  }

  if (method === "ppi" || method === "diagnosis") {
    recordServiceEvidence(car);
    findings.push(
      car.truth.serviceHistory === "full"
        ? "Logbook sighted: full service history."
        : car.truth.serviceHistory === "partial"
          ? "Only partial service records."
          : "No service records at all.",
    );
  }

  const label = { visual: "Visual inspection", testDrive: "Test drive", ppi: "Pre-purchase inspection", diagnosis: "Workshop diagnosis" }[method];
  if (findings.length === 0) findings.push("Nothing of note found.");
  k.notes.push(`${label} (day ${state.day}): ${findings.join(" ")}`);
  const cost = method === "ppi" ? ` (${formatMoney(CONFIG.inspections.ppi.cost)})` : "";
  emit(state, findings[0] === "Nothing of note found." ? "good" : "info", `${label}${cost} on the ${titleOf(car)}: ${findings.join(" ")}`, events);
  return findings;
}
