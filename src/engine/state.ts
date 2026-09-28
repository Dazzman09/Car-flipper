import { z } from "zod";

/**
 * Game state schema. The zod schema is the single source of truth for the
 * shape of a save file; TypeScript types are inferred from it.
 *
 * Every car keeps two separate records:
 *  - `truth`: what is actually wrong with it (generated once, when the car
 *    enters the world, and never rerolled);
 *  - `knowledge`: what the player has learned. Player-facing estimates are
 *    computed from `knowledge` plus the public listing only.
 */

export const SCHEMA_VERSION = 1;

const cents = z.number().int();
const day = z.number().int().min(1);
const unit = z.number().min(0).max(1);

export const SeveritySchema = z.enum(["minor", "moderate", "major"]);
export const ServiceHistorySchema = z.enum(["full", "partial", "none"]);
export const ServiceEvidenceSchema = z.enum([
  "unknown",
  "logbook-sighted",
  "partial-records",
  "no-records",
  "workshop-service",
]);
export const InspectionMethodSchema = z.enum(["visual", "testDrive", "ppi", "diagnosis"]);
export const QuestionIdSchema = z.enum(["mechanical", "service", "accidents", "modifications", "reason"]);

export const ActualFaultSchema = z.object({
  id: z.string(),
  typeId: z.string(),
  severity: SeveritySchema,
  repairCents: cents,
  repaired: z.boolean(),
  sellerKnows: z.boolean(),
  /** Disclosed in the listing and already reflected in the asking price. */
  sellerDisclosed: z.boolean(),
});

export const TruthSchema = z.object({
  faults: z.array(ActualFaultSchema),
  serviceHistory: ServiceHistorySchema,
  presentation: z.number().int().min(0).max(100),
  hiddenModifications: z.array(z.string()),
  maintenance: unit,
});

export const ClaimSchema = z.object({
  id: z.string(),
  topic: z.enum(["mechanical", "service", "accidents", "modifications", "general"]),
  text: z.string(),
  source: z.enum(["listing", "seller"]),
  status: z.enum(["unverified", "confirmed", "contradicted"]),
});

export const ConfirmedFaultSchema = z.object({
  faultId: z.string(),
  typeId: z.string(),
  severity: SeveritySchema,
  source: z.enum(["visual", "testDrive", "ppi", "diagnosis", "seller"]),
  day,
  repaired: z.boolean(),
});

export const SymptomSchema = z.object({
  system: z.string(),
  text: z.string(),
  day,
});

export const KnowledgeSchema = z.object({
  inspections: z.array(z.object({ method: InspectionMethodSchema, day })),
  claims: z.array(ClaimSchema),
  symptoms: z.array(SymptomSchema),
  confirmedFaults: z.array(ConfirmedFaultSchema),
  discoveredModifications: z.array(z.string()),
  serviceEvidence: ServiceEvidenceSchema,
  notes: z.array(z.string()),
});

export const OfferRecordSchema = z.object({
  day,
  by: z.enum(["player", "seller"]),
  amountCents: cents,
  outcome: z.enum(["countered", "accepted", "rejected", "walked-away", "revised"]),
  message: z.string(),
});

export const SellerSchema = z.object({
  name: z.string(),
  personality: z.enum(["friendly", "blunt", "haggler", "proud"]),
  urgency: unit,
  honesty: unit,
  mechanicalKnowledge: unit,
  patience: z.number().int().min(0),
  maxPatience: z.number().int().min(1),
  reservationCents: cents,
  currentAskCents: cents,
  concessionsUsed: z.array(z.string()),
  offers: z.array(OfferRecordSchema),
  status: z.enum(["open", "agreed", "walked-away"]),
  agreed: z.object({ amountCents: cents, expiresDay: day }).nullable(),
  questionsAsked: z.array(QuestionIdSchema),
  reason: z.string(),
});

export const CarSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  imageSetId: z.string(),
  year: z.number().int(),
  odometerKm: z.number().int().min(0),
  generatedDay: day,
  status: z.enum(["listed", "owned", "sold", "gone"]),
  goneReason: z.enum(["expired", "sold-to-competitor"]).nullable(),
  truth: TruthSchema,
  seller: SellerSchema,
  listing: z.object({
    askingCents: cents,
    postedDay: day,
    expiresDay: day,
    description: z.string(),
  }),
  knowledge: KnowledgeSchema,
  acquisition: z.object({ day, priceCents: cents }).nullable(),
  sale: z.object({ day, priceCents: cents, channel: z.enum(["private", "wholesale"]) }).nullable(),
});

export const JobKindSchema = z.enum(["repair", "detail", "service", "diagnosis"]);

export const WorkshopJobSchema = z.object({
  id: z.string(),
  carId: z.string(),
  kind: JobKindSchema,
  faultId: z.string().nullable(),
  costCents: cents,
  bookedDay: day,
  completionDay: day,
  status: z.enum(["in-progress", "completed"]),
});

export const SaleListingSchema = z.object({
  carId: z.string(),
  askingCents: cents,
  advertText: z.string(),
  disclosedFaultIds: z.array(z.string()),
  disclosedModificationIds: z.array(z.string()),
  listedDay: day,
  quality: unit,
  status: z.enum(["active", "sold", "withdrawn"]),
});

export const BuyerSchema = z.object({
  id: z.string(),
  carId: z.string(),
  name: z.string(),
  inspection: z.enum(["test-drive", "look-over", "mechanic"]),
  /** Hidden: the most this buyer will pay after inspecting. */
  maxPriceCents: cents,
  offerCents: cents,
  offerDay: day,
  expiresDay: day,
  status: z.enum(["offered", "accepted", "declined", "expired", "walked-away", "invalidated"]),
  countered: z.boolean(),
  discoveredFaultIds: z.array(z.string()),
  message: z.string(),
});

export const LedgerKindSchema = z.enum([
  "purchase",
  "acquisition-fee",
  "inspection",
  "repair",
  "detail",
  "service",
  "diagnosis",
  "holding",
  "sale",
  "wholesale",
  "side-job",
  "garage-upgrade",
]);

export const LedgerEntrySchema = z.object({
  id: z.string(),
  day,
  kind: LedgerKindSchema,
  amountCents: cents,
  carId: z.string().nullable(),
  memo: z.string(),
});

export const FlipRecordSchema = z.object({
  carId: z.string(),
  title: z.string(),
  boughtDay: day,
  soldDay: day,
  channel: z.enum(["private", "wholesale"]),
  purchaseCents: cents,
  acquisitionCents: cents,
  inspectionCents: cents,
  repairCents: cents,
  detailCents: cents,
  holdingCents: cents,
  otherCents: cents,
  totalCostCents: cents,
  saleCents: cents,
  profitCents: cents,
  honest: z.boolean(),
});

export const GameEventSchema = z.object({
  id: z.string(),
  day,
  tone: z.enum(["info", "good", "bad"]),
  text: z.string(),
});

export const GameStateSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  careerId: z.string(),
  worldSeed: z.number().int(),
  imagePolicy: z.enum(["verified-only", "allow-pending"]),
  day,
  actionPoints: z.number().int().min(0),
  cash: cents,
  startingCash: cents,
  garageSpaces: z.number().int().min(1),
  reputation: z.number().int().min(-20).max(25),
  premiumUnlocked: z.boolean(),
  nextId: z.number().int().min(1),
  cars: z.record(z.string(), CarSchema),
  marketplace: z.array(z.string()),
  owned: z.array(z.string()),
  jobs: z.array(WorkshopJobSchema),
  saleListings: z.record(z.string(), SaleListingSchema),
  buyers: z.record(z.string(), BuyerSchema),
  ledger: z.array(LedgerEntrySchema),
  flips: z.array(FlipRecordSchema),
  events: z.array(GameEventSchema),
  stats: z.object({
    inspections: z.number().int(),
    offersMade: z.number().int(),
    sideJobs: z.number().int(),
    daysPlayed: z.number().int(),
  }),
  tutorial: z.object({ dismissed: z.boolean() }),
});

export type Severity = z.infer<typeof SeveritySchema>;
export type ServiceHistory = z.infer<typeof ServiceHistorySchema>;
export type ServiceEvidence = z.infer<typeof ServiceEvidenceSchema>;
export type InspectionMethod = z.infer<typeof InspectionMethodSchema>;
export type QuestionId = z.infer<typeof QuestionIdSchema>;
export type ActualFault = z.infer<typeof ActualFaultSchema>;
export type Truth = z.infer<typeof TruthSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type ConfirmedFault = z.infer<typeof ConfirmedFaultSchema>;
export type Knowledge = z.infer<typeof KnowledgeSchema>;
export type Seller = z.infer<typeof SellerSchema>;
export type OfferRecord = z.infer<typeof OfferRecordSchema>;
export type Car = z.infer<typeof CarSchema>;
export type JobKind = z.infer<typeof JobKindSchema>;
export type WorkshopJob = z.infer<typeof WorkshopJobSchema>;
export type SaleListing = z.infer<typeof SaleListingSchema>;
export type Buyer = z.infer<typeof BuyerSchema>;
export type LedgerKind = z.infer<typeof LedgerKindSchema>;
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;
export type FlipRecord = z.infer<typeof FlipRecordSchema>;
export type GameEvent = z.infer<typeof GameEventSchema>;
export type GameState = z.infer<typeof GameStateSchema>;

/**
 * What the player can see of a car: public listing details plus their own
 * knowledge. Estimates and UI must only use this view. It deliberately has no
 * `truth` or seller reservation.
 */
export interface PublicCarView {
  id: string;
  variantId: string;
  imageSetId: string;
  year: number;
  odometerKm: number;
  presentation: number;
  visibleModifications: readonly string[];
  knowledge: Knowledge;
  /** Today's public price index for the car's segment. */
  marketIndex: number;
}
