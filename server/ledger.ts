import type { Express, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from "node:crypto";

type CampaignStatus = "active" | "paused" | "completed" | "archived";
type MentorStage = "new" | "matched" | "drafted" | "approved" | "contacted" | "responded" | "follow_up" | "closed";
type DraftStatus = "draft" | "approved" | "rejected" | "sent";
type MessageQualityStatus = "pass" | "warning" | "blocked";
type ApprovalDecision = "approved" | "rejected";
type SendStatus = "confirmed_sent" | "failed";
type ResponseClassification = "interested" | "not_interested" | "more_info" | "unavailable" | "unknown";
type FollowUpStatus = "scheduled" | "completed" | "cancelled";
type ResourceSessionStatus = "active" | "ended";
type OutcomeStatus = "open" | "booked" | "helpful" | "declined" | "no_response" | "not_relevant" | "closed";
type InvoiceStatus = "generated" | "void";
type MentorSourceStatus = "planned" | "searched" | "imported" | "skipped";
type NextActionPriority = "high" | "medium" | "low";
type NextActionType =
  | "record_source_search"
  | "add_mentors"
  | "draft_message"
  | "review_fit"
  | "review_duplicate_profile"
  | "fix_blocked_draft"
  | "review_draft"
  | "confirm_manual_send"
  | "follow_up_due"
  | "record_response_outcome"
  | "generate_cost_record"
  | "generate_invoice_record";

type Operator = {
  id: string;
  name: string;
  createdAt: string;
};

type OutreachProject = {
  id: string;
  userId: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

type OutreachCampaign = {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  goal: string;
  targetMentorType: string;
  status: CampaignStatus;
  source: string;
  criteriaJson: Record<string, unknown>;
  totalMentors: number;
  messagesDrafted: number;
  messagesApproved: number;
  messagesSent: number;
  responsesReceived: number;
  followUpsDue: number;
  createdAt: string;
  updatedAt: string;
};

type CampaignCriteria = {
  tone: string;
  followUpAfterDays: number;
  requiredApproval: boolean;
  skills: string[];
  industries: string[];
  locations: string[];
  minimumFitScore: number;
};

type MentorSource = {
  id: string;
  campaignId: string;
  name: string;
  sourceType: string;
  searchQuery: string;
  status: MentorSourceStatus;
  resultsFound: number;
  importedCount: number;
  notes: string;
  searchedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type DiscoveryPlanSource = {
  id: string;
  name: string;
  sourceType: string;
  searchQuery: string;
  launchUrl: string;
  rationale: string;
  privacyNote: string;
  status: "recommended" | "recorded";
  sourceRecordId: string | null;
};

type DiscoveryPlan = {
  campaignId: string;
  generatedAt: string;
  queryBasis: {
    targetMentorType: string;
    skills: string[];
    industries: string[];
    locations: string[];
  };
  sources: DiscoveryPlanSource[];
  unrecordedCount: number;
};

type MentorIdentity = {
  id: string;
  normalizedName: string;
  normalizedCompany: string;
  createdAt: string;
  updatedAt: string;
};

type MentorProfile = {
  id: string;
  campaignId: string;
  mentorIdentityId: string;
  source: string;
  sourceRecordId: string | null;
  sourceProfileId: string | null;
  profileUrl: string | null;
  name: string;
  headline: string;
  bio: string;
  skills: string[];
  industries: string[];
  location: string;
  availability: string;
  contactMethod: string;
  rawProfileJson: Record<string, unknown>;
  stage: MentorStage;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

type MatchAssessment = {
  id: string;
  mentorProfileId: string;
  campaignId: string;
  score: number;
  reasonsJson: string[];
  risksJson: string[];
  confidence: number;
  createdAt: string;
};

type MessageDraft = {
  id: string;
  campaignId: string;
  mentorProfileId: string;
  subject: string;
  body: string;
  language: string;
  status: DraftStatus;
  generatedBy: string;
  createdAt: string;
  updatedAt: string;
};

type MessageQualityReview = {
  id: string;
  messageDraftId: string;
  campaignId: string;
  mentorProfileId: string;
  status: MessageQualityStatus;
  warningsJson: string[];
  metricsJson: {
    subjectLength: number;
    bodyLength: number;
    readingTimeSeconds: number;
    personalizationScore: number;
    unresolvedTokenCount: number;
    callToActionCount: number;
  };
  createdAt: string;
  updatedAt: string;
};

type MessageApproval = {
  id: string;
  messageDraftId: string;
  decision: ApprovalDecision;
  decisionReason: string;
  approvedSubjectSnapshot: string;
  approvedBodySnapshot: string;
  decidedAt: string;
  createdAt: string;
};

type MessageSendAttempt = {
  id: string;
  messageDraftId: string;
  mentorProfileId: string;
  campaignId: string;
  status: SendStatus;
  channel: string;
  startedAt: string;
  finishedAt: string;
  errorMessage: string | null;
  deliveryEvidence: string;
  retryCount: number;
  createdAt: string;
};

type MentorResponse = {
  id: string;
  campaignId: string;
  mentorProfileId: string;
  messageDraftId: string | null;
  classification: ResponseClassification;
  body: string;
  nextAction: string;
  createdAt: string;
};

type FollowUpPlan = {
  id: string;
  campaignId: string;
  mentorProfileId: string;
  messageDraftId: string | null;
  dueAt: string;
  status: FollowUpStatus;
  suggestedMessage: string;
  createdAt: string;
  updatedAt: string;
};

type ResourceUsageSession = {
  id: string;
  campaignId: string;
  userId: string;
  status: ResourceSessionStatus;
  measurementMode: "process";
  measurementNote: string;
  startedAt: string;
  endedAt: string | null;
  cpuCoreHours: number;
  ramGbHours: number;
  storageGbHours: number;
  bandwidthGb: number;
  estimatedKwh: number;
  rawResourceCost: number;
  finalCost: number;
  pricingFormula: string;
  startSnapshot: ResourceSnapshot;
  endSnapshot: ResourceSnapshot | null;
  createdAt: string;
};

type ResourceSnapshot = {
  timestamp: string;
  cpuUserMicros: number;
  cpuSystemMicros: number;
  rssBytes: number;
  heapUsedBytes: number;
  ledgerBytes: number;
  observedApiBytes: number;
};

type BillingRecord = {
  id: string;
  campaignId: string;
  resourceUsageSessionId: string;
  rawResourceCost: number;
  finalCost: number;
  currency: "EUR";
  pricingFormula: string;
  generatedAt: string;
};

type InvoiceRecord = {
  id: string;
  campaignId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  currency: "EUR";
  rawResourceCost: number;
  finalCost: number;
  pricingFormula: string;
  measurementNote: string;
  lineItemsJson: Array<{
    billingRecordId: string;
    resourceUsageSessionId: string;
    rawResourceCost: number;
    finalCost: number;
    generatedAt: string;
  }>;
  totalsJson: {
    mentors: number;
    messagesDrafted: number;
    messagesApproved: number;
    messagesSent: number;
    responsesReceived: number;
    followUpsDue: number;
    outcomesRecorded: number;
  };
  generatedAt: string;
  createdAt: string;
};

type OutreachOutcome = {
  id: string;
  campaignId: string;
  mentorProfileId: string;
  status: OutcomeStatus;
  summary: string;
  valueLevel: "low" | "medium" | "high";
  createdAt: string;
  updatedAt: string;
};

type CampaignResults = {
  totals: {
    mentors: number;
    contacted: number;
    responses: number;
    outcomes: number;
    booked: number;
    helpful: number;
    declined: number;
    noResponse: number;
    overdueFollowUps: number;
    openLoops: number;
  };
  rates: {
    responseRate: number;
    bookingRate: number;
    positiveOutcomeRate: number;
  };
  outcomeBreakdown: Record<OutcomeStatus, number>;
  followUpBreakdown: Record<FollowUpStatus, number>;
};

type NextActionRecommendation = {
  id: string;
  campaignId: string;
  sourceRecordId?: string | null;
  mentorProfileId: string | null;
  messageDraftId: string | null;
  followUpId: string | null;
  responseId: string | null;
  priority: NextActionPriority;
  type: NextActionType;
  title: string;
  description: string;
  recommendedAction: string;
  dueAt: string | null;
  createdFrom: "derived_from_ledger";
};

type CampaignReadinessItem = {
  id: string;
  label: string;
  status: "complete" | "attention" | "blocked";
  completed: number;
  total: number;
  detail: string;
  nextActionType: NextActionType | null;
};

type CampaignReadiness = {
  score: number;
  status: "ready" | "needs_work" | "blocked";
  completedItems: number;
  totalItems: number;
  blockers: number;
  attentionItems: number;
  items: CampaignReadinessItem[];
};

type HaiCampaignSnapshot = {
  campaignId: string;
  projectId: string;
  projectTitle: string | null;
  title: string;
  status: CampaignStatus;
  readiness: CampaignReadiness;
  nextActions: NextActionRecommendation[];
  blockers: CampaignReadinessItem[];
  attentionItems: CampaignReadinessItem[];
  totals: CampaignResults["totals"];
  rates: CampaignResults["rates"];
  queue: {
    draftReview: number;
    approvedAwaitingManualSend: number;
    followUpsDue: number;
    responsesAwaitingOutcome: number;
    duplicateReviews: number;
    blockedDrafts: number;
  };
  costs: {
    billingRecords: number;
    invoiceRecords: number;
    finalCost: number;
    currency: "EUR";
  };
  updatedAt: string;
};

type HaiIntegrationStatus = {
  service: "maro-ledger";
  generatedAt: string;
  safety: {
    externalSending: "manual_only";
    approvalRequiredBeforeSend: true;
    completionRequiresReadiness: true;
    notes: string;
  };
  campaigns: HaiCampaignSnapshot[];
  totals: {
    campaigns: number;
    activeCampaigns: number;
    nextActions: number;
    blockers: number;
    attentionItems: number;
    followUpsDue: number;
    finalCost: number;
  };
};

type RelationshipTimelineEntry = {
  id: string;
  occurredAt: string;
  label: "Draft" | "Approval" | "Send" | "Response" | "Follow-up" | "Outcome" | "Audit";
  title: string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "danger";
  sensitiveKey?: string;
  sensitiveText?: string;
  sensitivePlaceholder?: string;
};

type MentorRelationshipTimeline = {
  mentorProfileId: string;
  generatedAt: string;
  entries: RelationshipTimelineEntry[];
};

type AuditEvent = {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  action: string;
  actor: string;
  beforeState: unknown;
  afterState: unknown;
  riskLevel: "low" | "medium" | "high";
  approvalId: string | null;
  createdAt: string;
};

type LedgerState = {
  schemaVersion: 1;
  operators: Operator[];
  projects: OutreachProject[];
  campaigns: OutreachCampaign[];
  mentorSources: MentorSource[];
  mentorIdentities: MentorIdentity[];
  mentorProfiles: MentorProfile[];
  matchAssessments: MatchAssessment[];
  messageDrafts: MessageDraft[];
  messageQualityReviews: MessageQualityReview[];
  messageApprovals: MessageApproval[];
  messageSendAttempts: MessageSendAttempt[];
  mentorResponses: MentorResponse[];
  followUpPlans: FollowUpPlan[];
  resourceUsageSessions: ResourceUsageSession[];
  billingRecords: BillingRecord[];
  invoiceRecords: InvoiceRecord[];
  outreachOutcomes: OutreachOutcome[];
  auditEvents: AuditEvent[];
};

type EncryptedLedgerEnvelope = {
  kind: "maro-encrypted-ledger";
  schemaVersion: 1;
  algorithm: "aes-256-gcm";
  kdf: "scrypt";
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
};

type WorkspaceResetScope = "queue" | "mentors" | "workspace";

const PRICING_FORMULA = "Resource Cost x 2 = Final Price";
const DEFAULT_USER_ID = "local-operator";
const DEFAULT_PROJECT_ID = "project-robert-support-network";
const DEFAULT_CAMPAIGN_ID = "campaign-micromentor-first-wave";
const ENCRYPTED_LEDGER_KIND = "maro-encrypted-ledger";
const LEDGER_ENCRYPTION_AAD = Buffer.from("maro-ledger-v1", "utf8");
const LEDGER_ARRAY_KEYS = [
  "operators",
  "projects",
  "campaigns",
  "mentorSources",
  "mentorIdentities",
  "mentorProfiles",
  "matchAssessments",
  "messageDrafts",
  "messageQualityReviews",
  "messageApprovals",
  "messageSendAttempts",
  "mentorResponses",
  "followUpPlans",
  "resourceUsageSessions",
  "billingRecords",
  "invoiceRecords",
  "outreachOutcomes",
  "auditEvents",
] as const;
let observedApiBytes = 0;

function now() {
  return new Date().toISOString();
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString();
}

function dataPath() {
  const dataDir = process.env.MARO_DATA_DIR || path.resolve(process.cwd(), "data");
  return path.join(dataDir, "maro-ledger.json");
}

function ledgerPassphrase() {
  return (process.env.MARO_LEDGER_PASSPHRASE || "").trim();
}

function storageStatus() {
  return {
    persistence: ledgerPassphrase() ? "encrypted-json" : "local-json",
    encrypted: Boolean(ledgerPassphrase()),
  };
}

function encryptedEnvelope(value: unknown): value is EncryptedLedgerEnvelope {
  const candidate = value as Partial<EncryptedLedgerEnvelope>;
  return Boolean(
    candidate &&
      candidate.kind === ENCRYPTED_LEDGER_KIND &&
      candidate.schemaVersion === 1 &&
      candidate.algorithm === "aes-256-gcm" &&
      candidate.kdf === "scrypt" &&
      typeof candidate.salt === "string" &&
      typeof candidate.iv === "string" &&
      typeof candidate.authTag === "string" &&
      typeof candidate.ciphertext === "string"
  );
}

function deriveLedgerKey(passphrase: string, salt: Buffer) {
  return scryptSync(passphrase, salt, 32);
}

function encryptLedgerJson(json: string) {
  const passphrase = ledgerPassphrase();
  if (!passphrase) return json;

  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveLedgerKey(passphrase, salt), iv);
  cipher.setAAD(LEDGER_ENCRYPTION_AAD);
  const ciphertext = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const envelope: EncryptedLedgerEnvelope = {
    kind: ENCRYPTED_LEDGER_KIND,
    schemaVersion: 1,
    algorithm: "aes-256-gcm",
    kdf: "scrypt",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return JSON.stringify(envelope, null, 2);
}

function decryptLedgerEnvelope(envelope: EncryptedLedgerEnvelope) {
  const passphrase = ledgerPassphrase();
  if (!passphrase) {
    throw new Error("Encrypted ledger requires MARO_LEDGER_PASSPHRASE");
  }

  try {
    const salt = Buffer.from(envelope.salt, "base64");
    const iv = Buffer.from(envelope.iv, "base64");
    const authTag = Buffer.from(envelope.authTag, "base64");
    const ciphertext = Buffer.from(envelope.ciphertext, "base64");
    const decipher = createDecipheriv("aes-256-gcm", deriveLedgerKey(passphrase, salt), iv);
    decipher.setAAD(LEDGER_ENCRYPTION_AAD);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Encrypted ledger could not be decrypted. Check MARO_LEDGER_PASSPHRASE.");
  }
}

function parseStoredLedger(contents: string): { state: Partial<LedgerState>; encrypted: boolean } {
  const parsed = JSON.parse(contents) as unknown;
  if (!encryptedEnvelope(parsed)) {
    return { state: parsed as Partial<LedgerState>, encrypted: false };
  }

  return {
    state: JSON.parse(decryptLedgerEnvelope(parsed)) as Partial<LedgerState>,
    encrypted: true,
  };
}

function ledgerFileBytes() {
  try {
    return fs.statSync(dataPath()).size;
  } catch {
    return 0;
  }
}

function resourceSnapshot(): ResourceSnapshot {
  const cpu = process.cpuUsage();
  const memory = process.memoryUsage();
  return {
    timestamp: now(),
    cpuUserMicros: cpu.user,
    cpuSystemMicros: cpu.system,
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    ledgerBytes: ledgerFileBytes(),
    observedApiBytes,
  };
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parsePositiveInteger(value: unknown, fallback: number, min = 1, max = 90) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function parseNonNegativeInteger(value: unknown, fallback = 0, max = 100000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(0, Math.round(parsed)));
}

function stringList(value: unknown) {
  const values = Array.isArray(value) ? value.map(String) : String(value || "").split(/[,;\n]/);
  const seen = new Set<string>();
  return values
    .map((item) => item.trim().slice(0, 80))
    .filter((item) => {
      const key = normalize(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 25);
}

function safeProfileUrl(value: unknown) {
  const profileUrl = String(value || "").trim();
  if (!profileUrl) return null;
  try {
    const parsed = new URL(profileUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? profileUrl : null;
  } catch {
    return null;
  }
}

function campaignCriteria(input: unknown): CampaignCriteria {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    tone: String(source.tone || "respectful, concise, practical").trim() || "respectful, concise, practical",
    followUpAfterDays: parsePositiveInteger(source.followUpAfterDays, 7),
    requiredApproval: source.requiredApproval === false ? false : true,
    skills: stringList(source.skills),
    industries: stringList(source.industries),
    locations: stringList(source.locations),
    minimumFitScore: parsePositiveInteger(source.minimumFitScore, 70, 35, 95),
  };
}

function sourceStatus(value: unknown): MentorSourceStatus {
  const status = String(value || "").trim().toLowerCase();
  return ["planned", "searched", "imported", "skipped"].includes(status) ? (status as MentorSourceStatus) : "planned";
}

function campaignFollowUpAfterDays(campaign: OutreachCampaign) {
  return campaignCriteria(campaign.criteriaJson).followUpAfterDays;
}

function campaignTone(campaign: OutreachCampaign) {
  return campaignCriteria(campaign.criteriaJson).tone;
}

function campaignFitThreshold(campaign: OutreachCampaign) {
  return campaignCriteria(campaign.criteriaJson).minimumFitScore;
}

function campaignScoringSignature(campaign: OutreachCampaign) {
  const criteria = campaignCriteria(campaign.criteriaJson);
  return JSON.stringify({
    goal: campaign.goal,
    targetMentorType: campaign.targetMentorType,
    skills: criteria.skills,
    industries: criteria.industries,
    locations: criteria.locations,
    minimumFitScore: criteria.minimumFitScore,
  });
}

function discoveryQuery(parts: string[]) {
  return stringList(parts).join(" ").slice(0, 240);
}

function buildDiscoveryPlan(state: LedgerState, campaign: OutreachCampaign): DiscoveryPlan {
  const criteria = campaignCriteria(campaign.criteriaJson);
  const skills = criteria.skills.slice(0, 5);
  const industries = criteria.industries.slice(0, 3);
  const locations = criteria.locations.slice(0, 3);
  const commonParts = [campaign.targetMentorType, ...skills, ...industries, ...locations];
  const recommendations = [
    {
      key: "micromentor",
      name: "MicroMentor mentor directory",
      sourceType: "MicroMentor",
      searchQuery: discoveryQuery(commonParts),
      launchUrl: "https://classic.micromentor.org/mentors",
      rationale: "Start with the dedicated mentor directory and apply its expertise, industry, language, and country filters.",
    },
    {
      key: "linkedin",
      name: "LinkedIn people search",
      sourceType: "LinkedIn",
      searchQuery: discoveryQuery([campaign.targetMentorType, ...skills, ...industries, "mentor", "advisor", ...locations]),
      launchUrl: "https://www.linkedin.com/search/results/people/",
      rationale: "Use professional role and skill signals to find experienced advisors beyond the dedicated mentoring directory.",
    },
    {
      key: "web",
      name: "Open web mentor research",
      sourceType: "Web search",
      searchQuery: discoveryQuery([campaign.targetMentorType, ...skills, ...industries, "mentor", "advisor", ...locations]),
      launchUrl: "https://www.google.com/",
      rationale: "Find public bios, advisory profiles, and community pages that can be verified before manual intake.",
    },
  ];
  const privacyNote = "Opening the source does not transmit this query; copy it only when you choose to search.";
  const sources = recommendations.map((recommendation) => {
    const sourceRecord = state.mentorSources.find(
      (source) =>
        source.campaignId === campaign.id &&
        normalize(source.sourceType) === normalize(recommendation.sourceType) &&
        normalize(source.searchQuery) === normalize(recommendation.searchQuery)
    );
    return {
      id: `discovery:${campaign.id}:${recommendation.key}`,
      name: recommendation.name,
      sourceType: recommendation.sourceType,
      searchQuery: recommendation.searchQuery,
      launchUrl: recommendation.launchUrl,
      rationale: recommendation.rationale,
      privacyNote,
      status: sourceRecord ? "recorded" as const : "recommended" as const,
      sourceRecordId: sourceRecord?.id || null,
    };
  });

  return {
    campaignId: campaign.id,
    generatedAt: now(),
    queryBasis: {
      targetMentorType: campaign.targetMentorType,
      skills,
      industries,
      locations,
    },
    sources,
    unrecordedCount: sources.filter((source) => source.status === "recommended").length,
  };
}

function toneOpening(tone: string) {
  const lowerTone = tone.toLowerCase();
  if (lowerTone.includes("direct") && lowerTone.includes("practical")) {
    return "I'll be direct and keep this practical.";
  }
  if (lowerTone.includes("concise")) {
    return "I'll keep this concise.";
  }
  if (lowerTone.includes("warm")) {
    return "I wanted to reach out respectfully because your profile stood out.";
  }
  return `I wanted to keep this outreach ${tone}.`;
}

function sentenceFragment(value: string) {
  return value.trim().replace(/[.!?]+$/, "");
}

function buildFirstTouchDraft(campaign: OutreachCampaign, mentor: MentorProfile, assessment: MatchAssessment | undefined) {
  const matchReason = sentenceFragment(assessment?.reasonsJson[0] || "your background appears connected to this campaign");
  return `Hi ${firstName(mentor.name)},\n\n${toneOpening(campaignTone(campaign))}\n\nI found your profile while working on: ${campaign.goal}\n\nYou look relevant because ${matchReason}.\n\nWould you be open to a short practical exchange?\n\nBest,\nRobert`;
}

function buildFollowUpSuggestion(campaign: OutreachCampaign, mentor: MentorProfile | undefined) {
  return `Hi ${mentor ? firstName(mentor.name) : "there"},\n\nFollowing up briefly on my earlier MicroMentor note about: ${campaign.goal}\n\n${toneOpening(campaignTone(campaign))}\n\nWould a short exchange still be useful?`;
}

function responseCancelsFollowUps(classification: ResponseClassification) {
  return classification === "not_interested" || classification === "unavailable";
}

const mentorStages: MentorStage[] = ["new", "matched", "drafted", "approved", "contacted", "responded", "follow_up", "closed"];

function parseMentorStage(value: unknown) {
  const stage = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return mentorStages.includes(stage as MentorStage) ? (stage as MentorStage) : null;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function csvEscape(value: unknown) {
  const rawText = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  const text = /^[=+\-@]/.test(rawText.trimStart()) ? `'${rawText}` : rawText;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function mentorsToCsv(mentors: MentorProfile[], assessments: MatchAssessment[], sources: MentorSource[] = []) {
  const headers = ["name", "company", "headline", "bio", "skills", "industries", "location", "source", "sourceSearch", "profileUrl", "stage", "notes", "score", "reasons"];
  const rows = mentors.map((mentor) => {
    const assessment = assessments.find((item) => item.mentorProfileId === mentor.id);
    const sourceRecord = mentor.sourceRecordId ? sources.find((item) => item.id === mentor.sourceRecordId) : null;
    const company = typeof mentor.rawProfileJson.company === "string" ? mentor.rawProfileJson.company : "";
    return [
      mentor.name,
      company,
      mentor.headline,
      mentor.bio,
      mentor.skills,
      mentor.industries,
      mentor.location,
      mentor.source,
      sourceRecord?.name || "",
      mentor.profileUrl || "",
      mentor.stage,
      mentor.notes,
      assessment?.score ?? "",
      assessment?.reasonsJson.join(" | ") ?? "",
    ];
  });

  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

function campaignHistoryToCsv(state: LedgerState, campaign: OutreachCampaign) {
  const headers = [
    "campaign",
    "campaignStatus",
    "goal",
    "targetMentorType",
    "mentorName",
    "company",
    "headline",
    "industries",
    "location",
    "source",
    "sourceSearch",
    "profileUrl",
    "mentorStage",
    "matchScore",
    "matchReasons",
    "messageCount",
    "latestMessageStatus",
    "latestMessageSubject",
    "sentAt",
    "responseClassification",
    "responseAt",
    "followUpStatus",
    "followUpDueAt",
    "outcomeStatus",
    "outcomeSummary",
    "notes",
  ];
  const mentors = state.mentorProfiles.filter((mentor) => mentor.campaignId === campaign.id);
  const rows = mentors.map((mentor) => {
    const assessment = state.matchAssessments.find((item) => item.mentorProfileId === mentor.id);
    const messages = state.messageDrafts.filter((item) => item.mentorProfileId === mentor.id);
    const latestMessage = latestByCreatedAt(messages);
    const latestSend = latestByCreatedAt(state.messageSendAttempts.filter((item) => item.mentorProfileId === mentor.id && item.status === "confirmed_sent"));
    const latestResponse = latestByCreatedAt(state.mentorResponses.filter((item) => item.mentorProfileId === mentor.id));
    const latestFollowUp = latestByCreatedAt(state.followUpPlans.filter((item) => item.mentorProfileId === mentor.id));
    const latestOutcome = latestByCreatedAt(state.outreachOutcomes.filter((item) => item.mentorProfileId === mentor.id));
    const sourceRecord = mentor.sourceRecordId ? state.mentorSources.find((item) => item.id === mentor.sourceRecordId) : null;
    const company = typeof mentor.rawProfileJson.company === "string" ? mentor.rawProfileJson.company : "";
    return [
      campaign.title,
      campaign.status,
      campaign.goal,
      campaign.targetMentorType,
      mentor.name,
      company,
      mentor.headline,
      mentor.industries,
      mentor.location,
      mentor.source,
      sourceRecord?.name || "",
      mentor.profileUrl || "",
      mentor.stage,
      assessment?.score ?? "",
      assessment?.reasonsJson.join(" | ") ?? "",
      messages.length,
      latestMessage?.status ?? "",
      latestMessage?.subject ?? "",
      latestSend?.finishedAt ?? "",
      latestResponse?.classification ?? "",
      latestResponse?.createdAt ?? "",
      latestFollowUp?.status ?? "",
      latestFollowUp?.dueAt ?? "",
      latestOutcome?.status ?? "",
      latestOutcome?.summary ?? "",
      mentor.notes,
    ];
  });

  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

function exportSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "maro";
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function createSeedState(): LedgerState {
  const createdAt = now();
  const operator: Operator = {
    id: DEFAULT_USER_ID,
    name: "Robert Velhorst",
    createdAt,
  };
  const project: OutreachProject = {
    id: DEFAULT_PROJECT_ID,
    userId: operator.id,
    title: "Robert support network",
    description: "Find mentors, advisors, and supporters who can move priority projects forward.",
    createdAt,
    updatedAt: createdAt,
  };
  const campaign: OutreachCampaign = {
    id: DEFAULT_CAMPAIGN_ID,
    userId: operator.id,
    projectId: project.id,
    title: "MicroMentor first outreach wave",
    goal: "Find experienced mentors who can critique positioning, outreach process, and early automation workflow.",
    targetMentorType: "Startup, growth, operations, product, and automation mentors",
    status: "active",
    source: "MicroMentor/manual",
    criteriaJson: campaignCriteria({}),
    totalMentors: 0,
    messagesDrafted: 0,
    messagesApproved: 0,
    messagesSent: 0,
    responsesReceived: 0,
    followUpsDue: 0,
    createdAt,
    updatedAt: createdAt,
  };
  const source: MentorSource = {
    id: "source-micromentor-manual",
    campaignId: campaign.id,
    name: "MicroMentor manual search",
    sourceType: "MicroMentor",
    searchQuery: "Startup, growth, operations, product, and automation mentors",
    status: "planned",
    resultsFound: 0,
    importedCount: 0,
    notes: "Default planned source for the first outreach wave. Record searched/imported counts after manual discovery.",
    searchedAt: null,
    createdAt,
    updatedAt: createdAt,
  };

  return {
    schemaVersion: 1,
    operators: [operator],
    projects: [project],
    campaigns: [campaign],
    mentorSources: [source],
    mentorIdentities: [],
    mentorProfiles: [],
    matchAssessments: [],
    messageDrafts: [],
    messageQualityReviews: [],
    messageApprovals: [],
    messageSendAttempts: [],
    mentorResponses: [],
    followUpPlans: [],
    resourceUsageSessions: [],
    billingRecords: [],
    invoiceRecords: [],
    outreachOutcomes: [],
    auditEvents: [
      {
        id: randomUUID(),
        userId: operator.id,
        entityType: "campaign",
        entityId: campaign.id,
        action: "seeded_default_operating_ledger",
        actor: "system",
        beforeState: null,
        afterState: { campaignId: campaign.id },
        riskLevel: "low",
        approvalId: null,
        createdAt,
      },
    ],
  };
}

function normalizeState(state: Partial<LedgerState>): LedgerState {
  return {
    schemaVersion: 1,
    operators: state.operators || [],
    projects: state.projects || [],
    campaigns: (state.campaigns || []).map((campaign) => ({
      ...campaign,
      criteriaJson: campaignCriteria(campaign.criteriaJson),
    })),
    mentorSources: (state.mentorSources || []).map((source) => ({
      ...source,
      status: sourceStatus(source.status),
      resultsFound: parseNonNegativeInteger(source.resultsFound),
      importedCount: parseNonNegativeInteger(source.importedCount),
      searchedAt: source.searchedAt || null,
    })),
    mentorIdentities: state.mentorIdentities || [],
    mentorProfiles: (state.mentorProfiles || []).map((mentor) => ({
      ...mentor,
      sourceRecordId: mentor.sourceRecordId || null,
      skills: stringList(mentor.skills),
      industries: stringList(mentor.industries),
      location: String(mentor.location || ""),
      profileUrl: safeProfileUrl(mentor.profileUrl),
    })),
    matchAssessments: state.matchAssessments || [],
    messageDrafts: state.messageDrafts || [],
    messageQualityReviews: state.messageQualityReviews || [],
    messageApprovals: state.messageApprovals || [],
    messageSendAttempts: state.messageSendAttempts || [],
    mentorResponses: state.mentorResponses || [],
    followUpPlans: state.followUpPlans || [],
    resourceUsageSessions: (state.resourceUsageSessions || []).map((session) => ({
      ...session,
      measurementMode: "process" as const,
      measurementNote:
        session.measurementNote ||
        "Process-level local measurement using Node CPU time, RSS memory, ledger file size, and observed API payload bytes.",
      startSnapshot: session.startSnapshot || resourceSnapshot(),
      endSnapshot: session.endSnapshot || null,
    })),
    billingRecords: state.billingRecords || [],
    invoiceRecords: state.invoiceRecords || [],
    outreachOutcomes: state.outreachOutcomes || [],
    auditEvents: state.auditEvents || [],
  };
}

function readState(): LedgerState {
  const filePath = dataPath();
  if (!fs.existsSync(filePath)) {
    const state = createSeedState();
    writeState(state);
    return state;
  }

  const stored = parseStoredLedger(fs.readFileSync(filePath, "utf8"));
  const state = normalizeState(stored.state);
  if (ledgerPassphrase() && !stored.encrypted) {
    writeState(state);
  }
  return state;
}

function writeState(state: LedgerState) {
  const filePath = dataPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, encryptLedgerJson(JSON.stringify(state, null, 2)), "utf8");
}

function replaceState(target: LedgerState, next: LedgerState) {
  for (const key of Object.keys(target) as Array<keyof LedgerState>) {
    delete target[key];
  }
  Object.assign(target, next);
}

function workspaceSummary(state: LedgerState) {
  return {
    schemaVersion: state.schemaVersion,
    projects: state.projects.length,
    campaigns: state.campaigns.length,
    sourceRecords: state.mentorSources.length,
    mentors: state.mentorProfiles.length,
    identities: state.mentorIdentities.length,
    assessments: state.matchAssessments.length,
    drafts: state.messageDrafts.length,
    qualityReviews: state.messageQualityReviews.length,
    approvals: state.messageApprovals.length,
    sendAttempts: state.messageSendAttempts.length,
    responses: state.mentorResponses.length,
    followUps: state.followUpPlans.length,
    outcomes: state.outreachOutcomes.length,
    resourceSessions: state.resourceUsageSessions.length,
    billingRecords: state.billingRecords.length,
    invoiceRecords: state.invoiceRecords.length,
    auditEvents: state.auditEvents.length,
  };
}

function parseBackupPayload(body: unknown) {
  const payload = body && typeof body === "object" && "backup" in body
    ? (body as { backup?: unknown }).backup
    : body && typeof body === "object" && "backupJson" in body
      ? (body as { backupJson?: unknown }).backupJson
      : body;
  if (typeof payload === "string") {
    return JSON.parse(payload);
  }
  return payload;
}

function validateWorkspaceBackup(body: unknown): { state: LedgerState } | { error: string } {
  let payload: unknown;
  try {
    payload = parseBackupPayload(body);
  } catch {
    return { error: "Backup JSON could not be parsed" };
  }
  if (!payload || typeof payload !== "object") {
    return { error: "Backup must be a JSON object or JSON string" };
  }

  const envelope = payload as { kind?: unknown; schemaVersion?: unknown; ledger?: unknown };
  const candidate = envelope.ledger && typeof envelope.ledger === "object" ? envelope.ledger : payload;
  const ledger = candidate as Partial<LedgerState>;

  if (ledger.schemaVersion !== 1) {
    return { error: "Unsupported or missing backup schemaVersion" };
  }
  for (const key of LEDGER_ARRAY_KEYS) {
    if (!Array.isArray(ledger[key])) {
      return { error: `Backup is missing required array: ${key}` };
    }
  }

  const normalized = normalizeState(ledger);
  if (!normalized.operators.length) {
    return { error: "Backup must contain at least one operator" };
  }
  if (!normalized.projects.length) {
    return { error: "Backup must contain at least one project" };
  }
  if (!normalized.campaigns.length) {
    return { error: "Backup must contain at least one campaign" };
  }

  return { state: normalized };
}

function resetWorkspaceScope(state: LedgerState, scope: WorkspaceResetScope) {
  if (scope === "workspace") {
    replaceState(state, createSeedState());
    audit(state, "reset_workspace", "workspace", "local-ledger", workspaceSummary(state), { riskLevel: "high" });
    return;
  }

  const before = workspaceSummary(state);
  state.messageDrafts = [];
  state.messageQualityReviews = [];
  state.messageApprovals = [];
  state.messageSendAttempts = [];
  state.mentorResponses = [];
  state.followUpPlans = [];
  state.resourceUsageSessions = [];
  state.billingRecords = [];
  state.invoiceRecords = [];
  state.outreachOutcomes = [];

  if (scope === "mentors") {
    state.mentorSources = [];
    state.mentorIdentities = [];
    state.mentorProfiles = [];
    state.matchAssessments = [];
  } else {
    state.mentorProfiles = state.mentorProfiles.map((mentor) => ({
      ...mentor,
      stage: mentor.stage === "closed" ? "closed" : "matched",
      updatedAt: now(),
    }));
  }

  state.campaigns.forEach((campaign) => recalcCampaign(state, campaign.id));
  audit(state, scope === "mentors" ? "reset_mentor_data" : "reset_queue_data", "workspace", "local-ledger", workspaceSummary(state), {
    beforeState: before,
    riskLevel: "high",
  });
}

function audit(
  state: LedgerState,
  action: string,
  entityType: string,
  entityId: string,
  afterState: unknown,
  options: {
    beforeState?: unknown;
    riskLevel?: AuditEvent["riskLevel"];
    approvalId?: string | null;
    actor?: string;
  } = {}
) {
  state.auditEvents.unshift({
    id: randomUUID(),
    userId: DEFAULT_USER_ID,
    entityType,
    entityId,
    action,
    actor: options.actor || "local-operator",
    beforeState: options.beforeState ?? null,
    afterState,
    riskLevel: options.riskLevel || "low",
    approvalId: options.approvalId || null,
    createdAt: now(),
  });
}

function recalcCampaign(state: LedgerState, campaignId: string) {
  const campaign = state.campaigns.find((item) => item.id === campaignId);
  if (!campaign) return;

  const mentors = state.mentorProfiles.filter((item) => item.campaignId === campaignId);
  const drafts = state.messageDrafts.filter((item) => item.campaignId === campaignId);
  const responses = state.mentorResponses.filter((item) => item.campaignId === campaignId);
  const currentTime = Date.now();
  const dueFollowUps = state.followUpPlans.filter(
    (item) => item.campaignId === campaignId && item.status === "scheduled" && new Date(item.dueAt).getTime() <= currentTime
  );

  campaign.totalMentors = mentors.length;
  campaign.messagesDrafted = drafts.length;
  campaign.messagesApproved = drafts.filter((item) => item.status === "approved" || item.status === "sent").length;
  campaign.messagesSent = drafts.filter((item) => item.status === "sent").length;
  campaign.responsesReceived = responses.length;
  campaign.followUpsDue = dueFollowUps.length;
  campaign.updatedAt = now();
}

function priorityWeight(priority: NextActionPriority) {
  return priority === "high" ? 0 : priority === "medium" ? 1 : 2;
}

function latestByCreatedAt<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] || null;
}

function percent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function buildCampaignResults(state: LedgerState, campaignId: string): CampaignResults {
  const mentors = state.mentorProfiles.filter((item) => item.campaignId === campaignId);
  const messages = state.messageDrafts.filter((item) => item.campaignId === campaignId);
  const responses = state.mentorResponses.filter((item) => item.campaignId === campaignId);
  const followUps = state.followUpPlans.filter((item) => item.campaignId === campaignId);
  const outcomes = state.outreachOutcomes.filter((item) => item.campaignId === campaignId);
  const contactedMentorIds = new Set(messages.filter((message) => message.status === "sent").map((message) => message.mentorProfileId));
  const respondedMentorIds = new Set(responses.map((response) => response.mentorProfileId));
  const latestOutcomeByMentor = new Map<string, OutreachOutcome>();
  const currentTime = Date.now();

  for (const outcome of [...outcomes].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())) {
    latestOutcomeByMentor.set(outcome.mentorProfileId, outcome);
  }

  const outcomeBreakdown = {
    open: 0,
    booked: 0,
    helpful: 0,
    declined: 0,
    no_response: 0,
    not_relevant: 0,
    closed: 0,
  } satisfies Record<OutcomeStatus, number>;
  for (const outcome of outcomes) {
    outcomeBreakdown[outcome.status] += 1;
  }

  const followUpBreakdown = {
    scheduled: 0,
    completed: 0,
    cancelled: 0,
  } satisfies Record<FollowUpStatus, number>;
  for (const followUp of followUps) {
    followUpBreakdown[followUp.status] += 1;
  }

  const overdueFollowUps = followUps.filter((followUp) => followUp.status === "scheduled" && new Date(followUp.dueAt).getTime() <= currentTime).length;
  const openLoops = mentors.filter((mentor) => {
    const latestOutcome = latestOutcomeByMentor.get(mentor.id);
    if (latestOutcome && !["open"].includes(latestOutcome.status)) return false;
    return contactedMentorIds.has(mentor.id) || respondedMentorIds.has(mentor.id) || followUps.some((followUp) => followUp.mentorProfileId === mentor.id && followUp.status === "scheduled");
  }).length;
  const positiveOutcomes = outcomeBreakdown.booked + outcomeBreakdown.helpful;

  return {
    totals: {
      mentors: mentors.length,
      contacted: contactedMentorIds.size,
      responses: respondedMentorIds.size,
      outcomes: outcomes.length,
      booked: outcomeBreakdown.booked,
      helpful: outcomeBreakdown.helpful,
      declined: outcomeBreakdown.declined,
      noResponse: outcomeBreakdown.no_response,
      overdueFollowUps,
      openLoops,
    },
    rates: {
      responseRate: percent(respondedMentorIds.size, contactedMentorIds.size),
      bookingRate: percent(outcomeBreakdown.booked, contactedMentorIds.size),
      positiveOutcomeRate: percent(positiveOutcomes, contactedMentorIds.size),
    },
    outcomeBreakdown,
    followUpBreakdown,
  };
}

function buildCampaignReadiness(state: LedgerState, campaignId: string): CampaignReadiness {
  const sourceRecords = state.mentorSources.filter((item) => item.campaignId === campaignId);
  const searchedSourceRecords = sourceRecords.filter((item) => item.status === "searched" || item.status === "imported");
  const mentors = state.mentorProfiles.filter((item) => item.campaignId === campaignId);
  const mentorIds = new Set(mentors.map((mentor) => mentor.id));
  const assessments = state.matchAssessments.filter((item) => item.campaignId === campaignId && mentorIds.has(item.mentorProfileId));
  const messages = state.messageDrafts.filter((item) => item.campaignId === campaignId);
  const messageIds = new Set(messages.map((message) => message.id));
  const qualityReviews = state.messageQualityReviews.filter((review) => messageIds.has(review.messageDraftId));
  const responses = state.mentorResponses.filter((item) => item.campaignId === campaignId);
  const outcomes = state.outreachOutcomes.filter((item) => item.campaignId === campaignId);
  const billingRecords = state.billingRecords.filter((item) => item.campaignId === campaignId);
  const invoiceRecords = state.invoiceRecords.filter((item) => item.campaignId === campaignId);
  const results = buildCampaignResults(state, campaignId);
  const activeMentors = mentors.filter((mentor) => mentor.stage !== "closed");
  const mentorsWithMessages = new Set(messages.map((message) => message.mentorProfileId));
  const reviewedMessages = messages.filter((message) => message.status !== "draft").length;
  const approvedMessages = messages.filter((message) => message.status === "approved" || message.status === "sent").length;
  const sentMessages = messages.filter((message) => message.status === "sent").length;
  const blockedQualityReviews = qualityReviews.filter((review) => review.status === "blocked").length;
  const pendingApprovedMessages = messages.filter((message) => message.status === "approved").length;
  const remainingSourceCandidates = sourceRecords.reduce((sum, source) => {
    if (source.status === "planned" || source.status === "skipped") return sum;
    return sum + Math.max(0, source.resultsFound - source.importedCount);
  }, 0);
  const recordedSourceResults = sourceRecords.reduce((sum, source) => sum + Math.max(0, source.resultsFound), 0);
  const importedSourceResults = sourceRecords.reduce((sum, source) => sum + Math.max(0, Math.min(source.importedCount, source.resultsFound || source.importedCount)), 0);
  const hasOperatingActivity = messages.length > 0 || responses.length > 0 || outcomes.length > 0;
  const draftedActiveMentors = activeMentors.filter((mentor) => mentorsWithMessages.has(mentor.id)).length;
  const allActiveMentorsDrafted = activeMentors.length > 0 && draftedActiveMentors === activeMentors.length;

  const items: CampaignReadinessItem[] = [
    {
      id: "source-search",
      label: "Source search",
      status: searchedSourceRecords.length ? "complete" : "attention",
      completed: searchedSourceRecords.length ? 1 : 0,
      total: 1,
      detail: searchedSourceRecords.length
        ? `${searchedSourceRecords.length} source search${searchedSourceRecords.length === 1 ? "" : "es"} recorded as searched or imported.`
        : sourceRecords.length
          ? `${sourceRecords.length} source${sourceRecords.length === 1 ? " is" : "s are"} planned; record a search outcome before candidate intake.`
          : "Record at least one mentor source search.",
      nextActionType: searchedSourceRecords.length ? null : "record_source_search",
    },
    {
      id: "source-candidates",
      label: "Source candidates",
      status: searchedSourceRecords.length && remainingSourceCandidates === 0 ? "complete" : "attention",
      completed: searchedSourceRecords.length && recordedSourceResults ? Math.min(importedSourceResults, recordedSourceResults) : 0,
      total: recordedSourceResults || 1,
      detail:
        !sourceRecords.length
          ? "Record a source search before candidate import can be assessed."
          : !searchedSourceRecords.length
            ? "Run a planned source search and record its result count before candidate import can be assessed."
          : remainingSourceCandidates === 0
          ? "No recorded source results are waiting to be imported."
          : `${remainingSourceCandidates} recorded source candidate${remainingSourceCandidates === 1 ? "" : "s"} still need import or skip review.`,
      nextActionType: !searchedSourceRecords.length ? "record_source_search" : remainingSourceCandidates === 0 ? null : "add_mentors",
    },
    {
      id: "mentor-profiles",
      label: "Mentor profiles",
      status: mentors.length ? "complete" : "blocked",
      completed: mentors.length,
      total: Math.max(1, mentors.length),
      detail: mentors.length ? `${mentors.length} mentor profile${mentors.length === 1 ? "" : "s"} available for scoring.` : "Add or import mentor profiles before drafting.",
      nextActionType: mentors.length ? null : "add_mentors",
    },
    {
      id: "fit-assessments",
      label: "Fit assessments",
      status: mentors.length && assessments.length >= mentors.length ? "complete" : mentors.length ? "attention" : "blocked",
      completed: assessments.length,
      total: Math.max(1, mentors.length),
      detail: mentors.length ? `${assessments.length} of ${mentors.length} mentor fit assessment${mentors.length === 1 ? "" : "s"} stored.` : "Mentor fit can be scored after profiles exist.",
      nextActionType: mentors.length && assessments.length >= mentors.length ? null : "review_fit",
    },
    {
      id: "message-drafts",
      label: "Message drafts",
      status: allActiveMentorsDrafted ? "complete" : activeMentors.length ? "attention" : "blocked",
      completed: draftedActiveMentors,
      total: Math.max(1, activeMentors.length),
      detail: activeMentors.length
        ? `${draftedActiveMentors} of ${activeMentors.length} active mentor${activeMentors.length === 1 ? "" : "s"} have drafts.`
        : "No active mentors are ready for drafting.",
      nextActionType: allActiveMentorsDrafted ? null : "draft_message",
    },
    {
      id: "draft-review",
      label: "Draft review",
      status: blockedQualityReviews ? "blocked" : messages.length && reviewedMessages === messages.length ? "complete" : "attention",
      completed: reviewedMessages,
      total: Math.max(1, messages.length),
      detail: blockedQualityReviews
        ? `${blockedQualityReviews} draft quality review${blockedQualityReviews === 1 ? "" : "s"} block approval.`
        : messages.length
          ? `${reviewedMessages} of ${messages.length} draft${messages.length === 1 ? "" : "s"} have approval decisions.`
          : "Drafts must be reviewed before any manual send confirmation.",
      nextActionType: blockedQualityReviews ? "fix_blocked_draft" : messages.length && reviewedMessages === messages.length ? null : "review_draft",
    },
    {
      id: "manual-delivery",
      label: "Manual delivery",
      status: approvedMessages && pendingApprovedMessages === 0 && sentMessages > 0 ? "complete" : approvedMessages ? "attention" : "attention",
      completed: sentMessages,
      total: Math.max(1, approvedMessages),
      detail: pendingApprovedMessages
        ? `${pendingApprovedMessages} approved message${pendingApprovedMessages === 1 ? "" : "s"} need manual delivery evidence.`
        : sentMessages
          ? `${sentMessages} approved message${sentMessages === 1 ? "" : "s"} confirmed sent manually.`
          : "Approve and manually confirm at least one message before measuring outreach results.",
      nextActionType: pendingApprovedMessages ? "confirm_manual_send" : null,
    },
    {
      id: "response-outcomes",
      label: "Response outcomes",
      status: sentMessages && results.totals.openLoops === 0 ? "complete" : "attention",
      completed: sentMessages ? Math.max(0, sentMessages - results.totals.openLoops) : 0,
      total: Math.max(1, sentMessages),
      detail: sentMessages
        ? `${results.totals.openLoops} open loop${results.totals.openLoops === 1 ? "" : "s"} remain across responses and follow-ups.`
        : "Outcomes become meaningful after manual sends are recorded.",
      nextActionType: results.totals.openLoops ? "record_response_outcome" : null,
    },
    {
      id: "cost-records",
      label: "Cost records",
      status: hasOperatingActivity && billingRecords.length > 0 ? "complete" : "attention",
      completed: billingRecords.length ? 1 : 0,
      total: 1,
      detail: billingRecords.length ? `${billingRecords.length} process-measured billing record${billingRecords.length === 1 ? "" : "s"} stored.` : "Generate a local process-measured resource cost record after campaign activity.",
      nextActionType: billingRecords.length ? null : "generate_cost_record",
    },
    {
      id: "invoice-snapshot",
      label: "Invoice snapshot",
      status: billingRecords.length && invoiceRecords.length > 0 ? "complete" : "attention",
      completed: invoiceRecords.length ? 1 : 0,
      total: 1,
      detail: invoiceRecords.length ? `${invoiceRecords.length} local invoice/usage snapshot${invoiceRecords.length === 1 ? "" : "s"} stored.` : "Persist an invoice report snapshot after reviewing resource costs.",
      nextActionType: billingRecords.length && invoiceRecords.length === 0 ? "generate_invoice_record" : null,
    },
  ];

  const completedItems = items.filter((item) => item.status === "complete").length;
  const blockers = items.filter((item) => item.status === "blocked").length;
  const attentionItems = items.filter((item) => item.status === "attention").length;
  return {
    score: Math.round((completedItems / items.length) * 100),
    status: blockers ? "blocked" : completedItems === items.length ? "ready" : "needs_work",
    completedItems,
    totalItems: items.length,
    blockers,
    attentionItems,
    items,
  };
}

function buildNextActionRecommendations(state: LedgerState, campaignId?: string) {
  const actions: NextActionRecommendation[] = [];
  const targetCampaigns = campaignId
    ? state.campaigns.filter((campaign) => campaign.id === campaignId)
    : state.campaigns.filter((campaign) => campaign.status !== "archived");
  const currentTime = Date.now();

  const pushAction = (action: Omit<NextActionRecommendation, "createdFrom">) => {
    actions.push({ ...action, createdFrom: "derived_from_ledger" });
  };

  for (const campaign of targetCampaigns) {
    recalcCampaign(state, campaign.id);
    const sourceRecords = state.mentorSources.filter((source) => source.campaignId === campaign.id);
    const searchedSourceRecords = sourceRecords.filter((source) => source.status === "searched" || source.status === "imported");
    const mentors = state.mentorProfiles.filter((mentor) => mentor.campaignId === campaign.id);
    const messages = state.messageDrafts.filter((message) => message.campaignId === campaign.id);
    const responses = state.mentorResponses.filter((response) => response.campaignId === campaign.id);
    const followUps = state.followUpPlans.filter((followUp) => followUp.campaignId === campaign.id);
    const outcomes = state.outreachOutcomes.filter((outcome) => outcome.campaignId === campaign.id);
    const billingRecords = state.billingRecords.filter((record) => record.campaignId === campaign.id);
    const invoiceRecords = state.invoiceRecords.filter((record) => record.campaignId === campaign.id);
    const sourcesWithRemainingResults = sourceRecords
      .map((source) => ({
        source,
        remainingResults: Math.max(0, source.resultsFound - source.importedCount),
      }))
      .filter((item) => item.source.status !== "planned" && item.source.status !== "skipped" && item.remainingResults > 0);

    if (!searchedSourceRecords.length) {
      const plannedSource = sourceRecords.find((source) => source.status === "planned") || null;
      pushAction({
        id: `action:record-source-search:${campaign.id}`,
        campaignId: campaign.id,
        sourceRecordId: plannedSource?.id || null,
        mentorProfileId: null,
        messageDraftId: null,
        followUpId: null,
        responseId: null,
        priority: "medium",
        type: "record_source_search",
        title: plannedSource ? `Run planned search: ${plannedSource.name}` : "Add a mentor discovery plan",
        description: plannedSource
          ? "A source is planned but has no searched or imported outcome yet."
          : "No mentor source has been planned or searched for this campaign.",
        recommendedAction: plannedSource
          ? "Open the source, copy its prepared query, then record the result count before importing mentor profiles."
          : "Review the campaign discovery plan and add its recommended sources to the ledger before searching.",
        dueAt: null,
      });
    }

    for (const { source, remainingResults } of sourcesWithRemainingResults) {
      pushAction({
        id: `action:import-source-mentors:${source.id}`,
        campaignId: campaign.id,
        sourceRecordId: source.id,
        mentorProfileId: null,
        messageDraftId: null,
        followUpId: null,
        responseId: null,
        priority: mentors.length ? "low" : "medium",
        type: "add_mentors",
        title: `Import ${remainingResults} mentor candidate${remainingResults === 1 ? "" : "s"} from ${source.name}`,
        description: `${source.name} has ${source.resultsFound} recorded result${source.resultsFound === 1 ? "" : "s"} and ${source.importedCount} imported mentor${source.importedCount === 1 ? "" : "s"}.`,
        recommendedAction: "Open Mentors with this source preselected, then import or add the remaining mentor profiles so fit scoring and draft recommendations can start.",
        dueAt: null,
      });
    }

    if (!mentors.length && !sourcesWithRemainingResults.length) {
      pushAction({
        id: `action:add-mentors:${campaign.id}`,
        campaignId: campaign.id,
        mentorProfileId: null,
        messageDraftId: null,
        followUpId: null,
        responseId: null,
        priority: "medium",
        type: "add_mentors",
        title: "Add mentors to start this campaign",
        description: campaign.goal,
        recommendedAction: "Import a CSV or add the first mentor profile so MARO can score fit and draft outreach.",
        dueAt: null,
      });
    }

    if ((messages.length > 0 || responses.length > 0 || outcomes.length > 0) && billingRecords.length === 0) {
      pushAction({
        id: `action:generate-cost-record:${campaign.id}`,
        campaignId: campaign.id,
        mentorProfileId: null,
        messageDraftId: null,
        followUpId: null,
        responseId: null,
        priority: "low",
        type: "generate_cost_record",
        title: "Generate a resource cost record",
        description: "This campaign has operating activity but no stored billing/resource record yet.",
        recommendedAction: "Open Billing and generate a process-measured cost record for transparent Resource Cost x 2 pricing.",
        dueAt: null,
      });
    }

    if (billingRecords.length > 0 && invoiceRecords.length === 0) {
      pushAction({
        id: `action:generate-invoice-record:${campaign.id}`,
        campaignId: campaign.id,
        mentorProfileId: null,
        messageDraftId: null,
        followUpId: null,
        responseId: null,
        priority: "low",
        type: "generate_invoice_record",
        title: "Generate an invoice report",
        description: "This campaign has billing records but no stored invoice/usage-report snapshot.",
        recommendedAction: "Generate a local invoice report after reviewing the cost breakdown. This records a report only; it does not charge anyone.",
        dueAt: null,
      });
    }

    for (const mentor of mentors) {
      const assessment = state.matchAssessments.find((item) => item.mentorProfileId === mentor.id);
      const mentorMessages = messages.filter((message) => message.mentorProfileId === mentor.id);
      const mentorResponses = responses.filter((response) => response.mentorProfileId === mentor.id);
      const mentorFollowUps = followUps.filter((followUp) => followUp.mentorProfileId === mentor.id);
      const mentorOutcomes = outcomes.filter((outcome) => outcome.mentorProfileId === mentor.id);
      const latestOutcome = latestByCreatedAt(mentorOutcomes);
      const latestResponse = latestByCreatedAt(mentorResponses);
      const terminalOutcome = latestOutcome && ["booked", "helpful", "declined", "no_response", "not_relevant", "closed"].includes(latestOutcome.status);

      for (const followUp of mentorFollowUps) {
        const due = followUp.status === "scheduled" && new Date(followUp.dueAt).getTime() <= currentTime;
        if (!due) continue;
        const linkedDraft = followUp.messageDraftId ? messages.find((message) => message.id === followUp.messageDraftId) : null;
        if (linkedDraft && (linkedDraft.status === "draft" || linkedDraft.status === "approved")) continue;
        pushAction({
          id: `action:follow-up-due:${followUp.id}`,
          campaignId: campaign.id,
          mentorProfileId: mentor.id,
          messageDraftId: followUp.messageDraftId,
          followUpId: followUp.id,
          responseId: null,
          priority: "high",
          type: "follow_up_due",
          title: `Follow up with ${mentor.name}`,
          description: `Follow-up was due ${followUp.dueAt}.`,
          recommendedAction: "Review the suggested follow-up, perform the manual outreach step if appropriate, then complete or cancel this follow-up.",
          dueAt: followUp.dueAt,
        });
      }

      if (latestResponse && !terminalOutcome) {
        const priority: NextActionPriority = latestResponse.classification === "interested" || latestResponse.classification === "more_info" ? "high" : "medium";
        pushAction({
          id: `action:record-response-outcome:${latestResponse.id}`,
          campaignId: campaign.id,
          mentorProfileId: mentor.id,
          messageDraftId: latestResponse.messageDraftId,
          followUpId: null,
          responseId: latestResponse.id,
          priority,
          type: "record_response_outcome",
          title: `Decide outcome for ${mentor.name}`,
          description: latestResponse.nextAction || `Latest response is ${latestResponse.classification.replace("_", " ")}.`,
          recommendedAction: "Record the outcome, close the loop, or schedule a follow-up based on the response.",
          dueAt: null,
        });
      }

      if (mentor.stage === "closed") continue;

      if (terminalOutcome) continue;

      const duplicateActiveDraft = activeDraftForMentorPerson(state, campaign.id, mentor);
      const canonicalDuplicate = canonicalMentorProfileForPerson(state, mentor);
      if (canonicalDuplicate && canonicalDuplicate.id !== mentor.id) {
        pushAction({
          id: `action:review-duplicate-profile:${mentor.id}`,
          campaignId: campaign.id,
          mentorProfileId: mentor.id,
          messageDraftId: null,
          followUpId: null,
          responseId: null,
          priority: "medium",
          type: "review_duplicate_profile",
          title: `Review duplicate profile for ${mentor.name}`,
          description: `${mentor.name} appears to match ${canonicalDuplicate.name} by identity or profile URL.`,
          recommendedAction: "Keep the source record for history, but use the existing mentor profile for outreach unless this is a genuinely different person.",
          dueAt: null,
        });
      }

      if (!mentorMessages.length && !duplicateActiveDraft) {
        const weakFit = assessment && assessment.score < campaignFitThreshold(campaign);
        pushAction({
          id: `action:${weakFit ? "review-fit" : "draft-message"}:${mentor.id}`,
          campaignId: campaign.id,
          mentorProfileId: mentor.id,
          messageDraftId: null,
          followUpId: null,
          responseId: null,
          priority: weakFit ? "low" : "medium",
          type: weakFit ? "review_fit" : "draft_message",
          title: weakFit ? `Review fit before drafting for ${mentor.name}` : `Draft outreach for ${mentor.name}`,
          description: weakFit ? "This mentor has a weaker automated fit score." : "This mentor has no message draft yet.",
          recommendedAction: weakFit ? "Inspect the profile and notes before deciding whether to draft outreach." : "Create a personalized draft and keep it in the approval queue.",
          dueAt: null,
        });
      }

      for (const message of mentorMessages) {
        if (message.status === "draft") {
          const qualityReview = state.messageQualityReviews.find((review) => review.messageDraftId === message.id) || upsertMessageQualityReview(state, message);
          const blocked = qualityReview?.status === "blocked";
          pushAction({
            id: `action:${blocked ? "fix-blocked-draft" : "review-draft"}:${message.id}`,
            campaignId: campaign.id,
            mentorProfileId: mentor.id,
            messageDraftId: message.id,
            followUpId: null,
            responseId: null,
            priority: blocked ? "high" : "medium",
            type: blocked ? "fix_blocked_draft" : "review_draft",
            title: blocked ? `Fix blocked draft for ${mentor.name}` : `Review draft for ${mentor.name}`,
            description: blocked ? (qualityReview?.warningsJson.join(" ") || "Message quality blocks approval.") : "Draft is waiting for explicit approval.",
            recommendedAction: blocked ? "Edit unresolved tokens or quality blockers before approving." : "Review the message, edit if needed, then approve or reject it.",
            dueAt: null,
          });
        }

        if (message.status === "approved") {
          pushAction({
            id: `action:confirm-manual-send:${message.id}`,
            campaignId: campaign.id,
            mentorProfileId: mentor.id,
            messageDraftId: message.id,
            followUpId: null,
            responseId: null,
            priority: "high",
            type: "confirm_manual_send",
            title: `Confirm manual send for ${mentor.name}`,
            description: "Approved message is waiting for manual delivery evidence.",
            recommendedAction: "Copy/send the approved message manually, then paste delivery evidence before marking it sent.",
            dueAt: null,
          });
        }
      }
    }
  }

  return actions.sort((left, right) => {
    const priorityDelta = priorityWeight(left.priority) - priorityWeight(right.priority);
    if (priorityDelta !== 0) return priorityDelta;
    const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (leftDue !== rightDue) return leftDue - rightDue;
    return left.title.localeCompare(right.title);
  });
}

function buildHaiIntegrationStatus(state: LedgerState, includeArchived = false): HaiIntegrationStatus {
  const campaigns = state.campaigns
    .filter((campaign) => includeArchived || campaign.status !== "archived")
    .map((campaign) => {
      recalcCampaign(state, campaign.id);
      const project = state.projects.find((item) => item.id === campaign.projectId);
      const readiness = buildCampaignReadiness(state, campaign.id);
      const nextActions = buildNextActionRecommendations(state, campaign.id);
      const results = buildCampaignResults(state, campaign.id);
      const billingRecords = state.billingRecords.filter((item) => item.campaignId === campaign.id);
      const invoiceRecords = state.invoiceRecords.filter((item) => item.campaignId === campaign.id);
      const countActions = (type: NextActionType) => nextActions.filter((action) => action.type === type).length;

      return {
        campaignId: campaign.id,
        projectId: campaign.projectId,
        projectTitle: project?.title || null,
        title: campaign.title,
        status: campaign.status,
        readiness,
        nextActions,
        blockers: readiness.items.filter((item) => item.status === "blocked"),
        attentionItems: readiness.items.filter((item) => item.status === "attention"),
        totals: results.totals,
        rates: results.rates,
        queue: {
          draftReview: countActions("review_draft") + countActions("fix_blocked_draft"),
          approvedAwaitingManualSend: countActions("confirm_manual_send"),
          followUpsDue: countActions("follow_up_due"),
          responsesAwaitingOutcome: countActions("record_response_outcome"),
          duplicateReviews: countActions("review_duplicate_profile"),
          blockedDrafts: countActions("fix_blocked_draft"),
        },
        costs: {
          billingRecords: billingRecords.length,
          invoiceRecords: invoiceRecords.length,
          finalCost: billingRecords.reduce((sum, item) => sum + item.finalCost, 0),
          currency: "EUR" as const,
        },
        updatedAt: campaign.updatedAt,
      };
    });

  const totals = campaigns.reduce(
    (acc, campaign) => ({
      campaigns: acc.campaigns + 1,
      activeCampaigns: acc.activeCampaigns + (campaign.status === "active" || campaign.status === "paused" ? 1 : 0),
      nextActions: acc.nextActions + campaign.nextActions.length,
      blockers: acc.blockers + campaign.blockers.length,
      attentionItems: acc.attentionItems + campaign.attentionItems.length,
      followUpsDue: acc.followUpsDue + campaign.queue.followUpsDue,
      finalCost: acc.finalCost + campaign.costs.finalCost,
    }),
    { campaigns: 0, activeCampaigns: 0, nextActions: 0, blockers: 0, attentionItems: 0, followUpsDue: 0, finalCost: 0 }
  );

  return {
    service: "maro-ledger",
    generatedAt: now(),
    safety: {
      externalSending: "manual_only",
      approvalRequiredBeforeSend: true,
      completionRequiresReadiness: true,
      notes: "This endpoint is a read-only operating snapshot. It exposes MARO ledger state for orchestration and reporting, but it does not send messages, approve drafts, or mutate external platforms.",
    },
    campaigns,
    totals,
  };
}

function formatTimelineDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildMentorRelationshipTimeline(state: LedgerState, mentor: MentorProfile): MentorRelationshipTimeline {
  const messages = state.messageDrafts.filter((item) => item.mentorProfileId === mentor.id);
  const messageIds = new Set(messages.map((item) => item.id));
  const followUps = state.followUpPlans.filter((item) => item.mentorProfileId === mentor.id);
  const followUpIds = new Set(followUps.map((item) => item.id));
  const responses = state.mentorResponses.filter((item) => item.mentorProfileId === mentor.id);
  const responseIds = new Set(responses.map((item) => item.id));
  const outcomes = state.outreachOutcomes.filter((item) => item.mentorProfileId === mentor.id);
  const outcomeIds = new Set(outcomes.map((item) => item.id));
  const approvalsByMessage = new Map<string, MessageApproval[]>();
  for (const approval of state.messageApprovals.filter((item) => messageIds.has(item.messageDraftId))) {
    approvalsByMessage.set(approval.messageDraftId, [...(approvalsByMessage.get(approval.messageDraftId) || []), approval]);
  }

  const entries: RelationshipTimelineEntry[] = [];
  for (const message of messages) {
    entries.push({
      id: `message:${message.id}`,
      occurredAt: message.updatedAt,
      label: "Draft",
      title: message.subject || "Message draft",
      detail: `Status: ${message.status}`,
      tone: message.status === "rejected" ? "danger" : message.status === "sent" ? "success" : message.status === "approved" ? "warning" : "neutral",
    });
    for (const approval of approvalsByMessage.get(message.id) || []) {
      entries.push({
        id: `approval:${approval.id}`,
        occurredAt: approval.decidedAt || approval.createdAt,
        label: "Approval",
        title: approval.decision === "approved" ? "Message approved" : "Message rejected",
        detail: approval.decisionReason || "No decision reason recorded.",
        tone: approval.decision === "approved" ? "success" : "danger",
      });
    }
  }

  for (const attempt of state.messageSendAttempts.filter((item) => item.mentorProfileId === mentor.id)) {
    const sensitiveText = attempt.deliveryEvidence
      ? `Delivery evidence: ${attempt.deliveryEvidence}`
      : attempt.errorMessage
      ? `Failure detail: ${attempt.errorMessage}`
      : undefined;
    entries.push({
      id: `send:${attempt.id}`,
      occurredAt: attempt.finishedAt || attempt.startedAt || attempt.createdAt,
      label: "Send",
      title: attempt.status === "confirmed_sent" ? "Manual send confirmed" : "Manual send failed",
      detail: attempt.status === "confirmed_sent" ? "Manual delivery evidence is recorded." : "Manual delivery failed and remains retryable.",
      tone: attempt.status === "confirmed_sent" ? "success" : "danger",
      sensitiveKey: sensitiveText ? `timeline-send:${attempt.id}` : undefined,
      sensitiveText,
      sensitivePlaceholder: sensitiveText ? "Delivery details hidden" : undefined,
    });
  }

  for (const response of responses) {
    entries.push({
      id: `response:${response.id}`,
      occurredAt: response.createdAt,
      label: "Response",
      title: `Response recorded: ${response.classification.replace("_", " ")}`,
      detail: response.nextAction || "Classify the response and decide the next step.",
      tone: response.classification === "interested" || response.classification === "more_info" ? "success" : response.classification === "not_interested" || response.classification === "unavailable" ? "warning" : "neutral",
      sensitiveKey: `timeline-response:${response.id}`,
      sensitiveText: response.body || "No response text recorded.",
      sensitivePlaceholder: "Response text hidden",
    });
  }

  for (const followUp of followUps) {
    entries.push({
      id: `follow-up:${followUp.id}`,
      occurredAt: followUp.updatedAt || followUp.createdAt,
      label: "Follow-up",
      title: `Follow-up ${followUp.status}`,
      detail: `Due ${formatTimelineDate(followUp.dueAt)}`,
      tone: followUp.status === "cancelled" ? "warning" : followUp.status === "completed" ? "success" : "neutral",
      sensitiveKey: `timeline-follow-up:${followUp.id}`,
      sensitiveText: followUp.suggestedMessage,
      sensitivePlaceholder: "Follow-up message hidden",
    });
  }

  for (const outcome of outcomes) {
    entries.push({
      id: `outcome:${outcome.id}`,
      occurredAt: outcome.updatedAt || outcome.createdAt,
      label: "Outcome",
      title: `Outcome: ${outcome.status.replace("_", " ")}`,
      detail: outcome.summary || "No outcome summary recorded.",
      tone: outcome.status === "booked" || outcome.status === "helpful" ? "success" : outcome.status === "declined" || outcome.status === "no_response" || outcome.status === "not_relevant" ? "warning" : "neutral",
    });
  }

  const auditEvents = state.auditEvents
    .filter(
      (event) =>
        event.entityId === mentor.id ||
        messageIds.has(event.entityId) ||
        followUpIds.has(event.entityId) ||
        responseIds.has(event.entityId) ||
        outcomeIds.has(event.entityId)
    )
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 6);
  for (const event of auditEvents) {
    entries.push({
      id: `audit:${event.id}`,
      occurredAt: event.createdAt,
      label: "Audit",
      title: event.action.replaceAll("_", " "),
      detail: `${event.entityType} event recorded with ${event.riskLevel} risk.`,
      tone: event.riskLevel === "high" ? "danger" : event.riskLevel === "medium" ? "warning" : "neutral",
    });
  }

  return {
    mentorProfileId: mentor.id,
    generatedAt: now(),
    entries: entries.sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()),
  };
}

function attachCampaignDetails(state: LedgerState, campaignId: string) {
  recalcCampaign(state, campaignId);
  const campaign = state.campaigns.find((item) => item.id === campaignId);
  if (!campaign) return null;
  const sourceRecords = state.mentorSources.filter((item) => item.campaignId === campaignId);
  const sourceRecordIds = new Set(sourceRecords.map((item) => item.id));
  const mentors = state.mentorProfiles.filter((item) => item.campaignId === campaignId);
  const mentorIds = new Set(mentors.map((item) => item.id));
  const messages = state.messageDrafts.filter((item) => item.campaignId === campaignId);
  const messageIds = new Set(messages.map((item) => item.id));
  const followUps = state.followUpPlans.filter((item) => item.campaignId === campaignId);
  const followUpIds = new Set(followUps.map((item) => item.id));
  const responses = state.mentorResponses.filter((item) => item.campaignId === campaignId);
  const responseIds = new Set(responses.map((item) => item.id));
  const resourceSessions = state.resourceUsageSessions.filter((item) => item.campaignId === campaignId);
  const resourceSessionIds = new Set(resourceSessions.map((item) => item.id));
  const billingRecords = state.billingRecords.filter((item) => item.campaignId === campaignId);
  const billingRecordIds = new Set(billingRecords.map((item) => item.id));
  const invoiceRecords = state.invoiceRecords.filter((item) => item.campaignId === campaignId);
  const invoiceRecordIds = new Set(invoiceRecords.map((item) => item.id));
  const outcomes = state.outreachOutcomes.filter((item) => item.campaignId === campaignId);
  const outcomeIds = new Set(outcomes.map((item) => item.id));

  return {
    campaign,
    discoveryPlan: buildDiscoveryPlan(state, campaign),
    sourceRecords,
    mentors,
    assessments: state.matchAssessments.filter((item) => item.campaignId === campaignId),
    messages,
    qualityReviews: state.messageQualityReviews.filter((item) => messageIds.has(item.messageDraftId)),
    approvals: state.messageApprovals.filter((item) => messageIds.has(item.messageDraftId)),
    sendAttempts: state.messageSendAttempts.filter((item) => item.campaignId === campaignId),
    responses,
    followUps,
    resourceSessions,
    billingRecords,
    invoiceRecords,
    outcomes,
    results: buildCampaignResults(state, campaignId),
    readiness: buildCampaignReadiness(state, campaignId),
    nextActions: buildNextActionRecommendations(state, campaignId),
    auditEvents: state.auditEvents.filter(
      (item) =>
        item.entityId === campaignId ||
        sourceRecordIds.has(item.entityId) ||
        mentorIds.has(item.entityId) ||
        messageIds.has(item.entityId) ||
        followUpIds.has(item.entityId) ||
        responseIds.has(item.entityId) ||
        resourceSessionIds.has(item.entityId) ||
        billingRecordIds.has(item.entityId) ||
        invoiceRecordIds.has(item.entityId) ||
        outcomeIds.has(item.entityId)
    ),
  };
}

function scoreMentor(
  campaign: OutreachCampaign,
  mentor: Pick<MentorProfile, "headline" | "bio" | "skills" | "industries" | "location">
) {
  const criteria = campaignCriteria(campaign.criteriaJson);
  const campaignText = `${campaign.goal} ${campaign.targetMentorType}`.toLowerCase();
  const profileText = `${mentor.headline} ${mentor.bio} ${mentor.skills.join(" ")} ${mentor.industries.join(" ")} ${mentor.location}`.toLowerCase();
  const keywords = Array.from(new Set(campaignText.split(/[^a-z0-9]+/).filter((word) => word.length > 4))).slice(0, 12);
  const keywordMatches = keywords.filter((word) => profileText.includes(word));
  const structuredCriteria = criteria.skills.length + criteria.industries.length + criteria.locations.length;

  if (!structuredCriteria) {
    const score = Math.min(98, Math.max(35, 45 + keywordMatches.length * 9));
    return {
      score,
      confidence: Math.min(0.95, 0.45 + keywordMatches.length * 0.08),
      reasonsJson: keywordMatches.length
        ? keywordMatches.slice(0, 5).map((word) => `Profile matches campaign keyword "${word}".`)
        : ["Profile was imported for manual review; add structured fit criteria for a stronger assessment."],
      risksJson: score < criteria.minimumFitScore
        ? [`Fit score is below the campaign threshold of ${criteria.minimumFitScore}%; review relevance before drafting outreach.`]
        : [],
    };
  }

  const matchTerms = (terms: string[], text: string) => terms.filter((term) => text.includes(normalize(term)));
  const skillText = normalize(`${mentor.skills.join(" ")} ${mentor.headline} ${mentor.bio}`);
  const industryText = normalize(`${mentor.industries.join(" ")} ${mentor.headline} ${mentor.bio}`);
  const locationText = normalize(mentor.location);
  const skillMatches = matchTerms(criteria.skills, skillText);
  const industryMatches = matchTerms(criteria.industries, industryText);
  const locationMatches = matchTerms(criteria.locations, locationText);
  const weightedSignals: Array<{ available: number; matched: number; weight: number }> = [
    { available: Math.min(6, keywords.length), matched: Math.min(6, keywordMatches.length), weight: 35 },
    { available: criteria.skills.length, matched: skillMatches.length, weight: 30 },
    { available: criteria.industries.length, matched: industryMatches.length, weight: 20 },
    { available: criteria.locations.length, matched: locationMatches.length, weight: 15 },
  ].filter((signal) => signal.available > 0);
  const totalWeight = weightedSignals.reduce((sum, signal) => sum + signal.weight, 0);
  const matchedWeight = weightedSignals.reduce(
    (sum, signal) => sum + signal.weight * Math.min(1, signal.matched / signal.available),
    0
  );
  const score = Math.min(98, Math.max(25, 25 + Math.round(73 * (matchedWeight / Math.max(1, totalWeight)))));
  const reasonsJson = [
    ...skillMatches.slice(0, 3).map((term) => `Skill evidence matches campaign criterion "${term}".`),
    ...industryMatches.slice(0, 2).map((term) => `Industry evidence matches campaign criterion "${term}".`),
    ...locationMatches.slice(0, 1).map((term) => `Location matches campaign preference "${term}".`),
    ...keywordMatches.slice(0, 3).map((word) => `Profile matches campaign keyword "${word}".`),
  ];
  const risksJson: string[] = [];
  if (criteria.skills.length && !skillMatches.length) risksJson.push("No campaign skill criteria were found in the profile evidence.");
  if (criteria.industries.length && !industryMatches.length) risksJson.push("No campaign industry criteria were found in the profile evidence.");
  if (criteria.locations.length && !locationMatches.length) risksJson.push("The profile location does not match a campaign location preference.");
  if (score < criteria.minimumFitScore) {
    risksJson.push(`Fit score is below the campaign threshold of ${criteria.minimumFitScore}%; review relevance before drafting outreach.`);
  }
  const profileEvidence = [mentor.headline, mentor.bio, mentor.skills.length, mentor.industries.length, mentor.location].filter(Boolean).length;

  return {
    score,
    confidence: Math.min(0.95, 0.5 + Math.min(0.25, structuredCriteria * 0.03) + profileEvidence * 0.04),
    reasonsJson: reasonsJson.length
      ? reasonsJson.slice(0, 7)
      : ["Structured campaign criteria are present, but this profile does not contain matching evidence yet."],
    risksJson,
  };
}

function rescoreCampaignMentors(state: LedgerState, campaign: OutreachCampaign) {
  const mentors = state.mentorProfiles.filter((mentor) => mentor.campaignId === campaign.id);
  for (const mentor of mentors) {
    const assessmentInput = scoreMentor(campaign, mentor);
    const assessment = state.matchAssessments.find((item) => item.mentorProfileId === mentor.id);
    if (assessment) {
      Object.assign(assessment, assessmentInput);
    } else {
      state.matchAssessments.unshift({
        id: randomUUID(),
        mentorProfileId: mentor.id,
        campaignId: campaign.id,
        ...assessmentInput,
        createdAt: now(),
      });
    }
  }
  return mentors.length;
}

function countMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

function reviewMessageQuality(campaign: OutreachCampaign, mentor: MentorProfile | undefined, draft: MessageDraft) {
  const subject = draft.subject.trim();
  const body = draft.body.trim();
  const combined = `${subject}\n${body}`;
  const lowerCombined = combined.toLowerCase();
  const unresolvedTokens = Array.from(combined.matchAll(/\{([^}]+)\}/g)).map((match) => match[1]?.trim()).filter(Boolean);
  const bodyWords = body.split(/\s+/).filter(Boolean).length;
  const callToActionCount = countMatches(lowerCombined, [
    /\?/,
    /\bwould you\b/,
    /\bcould we\b/,
    /\bopen to\b/,
    /\bshort (call|exchange|chat)\b/,
    /\bpractical exchange\b/,
  ]);

  const mentorName = mentor?.name.toLowerCase() || "";
  const first = mentor ? firstName(mentor.name).toLowerCase() : "";
  const mentorSignals = [mentorName, first, ...(mentor?.skills || []).map((skill) => skill.toLowerCase())]
    .filter((signal) => signal.length > 3);
  const campaignKeywords = campaign.goal.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 5).slice(0, 8);
  const personalizationHits =
    mentorSignals.filter((signal) => lowerCombined.includes(signal)).length +
    campaignKeywords.filter((word) => lowerCombined.includes(word)).length;
  const personalizationScore = Math.min(100, personalizationHits * 20);

  const warnings: string[] = [];
  if (!subject) warnings.push("Subject is empty.");
  if (subject.length > 90) warnings.push("Subject is long; keep it under 90 characters.");
  if (bodyWords < 45) warnings.push("Message body is short; add enough context to feel personal.");
  if (bodyWords > 220) warnings.push("Message body is long; trim it before asking for time.");
  if (personalizationScore < 40) warnings.push("Low personalization coverage; reference the mentor or campaign more clearly.");
  if (callToActionCount === 0) warnings.push("No clear question or call to action detected.");
  if (unresolvedTokens.length > 0) {
    warnings.push(`Unresolved template token(s): ${Array.from(new Set(unresolvedTokens)).join(", ")}.`);
  }

  const sentences = body.split(/[.!?]\s+/).map((sentence) => sentence.trim().toLowerCase()).filter((sentence) => sentence.length > 20);
  const repeatedSentence = sentences.find((sentence, index) => sentences.indexOf(sentence) !== index);
  if (repeatedSentence) warnings.push("Repeated sentence detected; review for accidental duplication.");

  const status: MessageQualityStatus = unresolvedTokens.length > 0 || !subject || !body
    ? "blocked"
    : warnings.length
      ? "warning"
      : "pass";

  return {
    status,
    warningsJson: warnings,
    metricsJson: {
      subjectLength: subject.length,
      bodyLength: body.length,
      readingTimeSeconds: Math.max(10, Math.round((bodyWords / 180) * 60)),
      personalizationScore,
      unresolvedTokenCount: unresolvedTokens.length,
      callToActionCount,
    },
  };
}

function upsertMessageQualityReview(state: LedgerState, draft: MessageDraft) {
  const campaign = state.campaigns.find((item) => item.id === draft.campaignId);
  if (!campaign) return null;
  const mentor = state.mentorProfiles.find((item) => item.id === draft.mentorProfileId);
  const reviewedAt = now();
  const reviewInput = reviewMessageQuality(campaign, mentor, draft);
  const existing = state.messageQualityReviews.find((item) => item.messageDraftId === draft.id);
  if (existing) {
    existing.status = reviewInput.status;
    existing.warningsJson = reviewInput.warningsJson;
    existing.metricsJson = reviewInput.metricsJson;
    existing.updatedAt = reviewedAt;
    return existing;
  }
  const review: MessageQualityReview = {
    id: randomUUID(),
    messageDraftId: draft.id,
    campaignId: draft.campaignId,
    mentorProfileId: draft.mentorProfileId,
    ...reviewInput,
    createdAt: reviewedAt,
    updatedAt: reviewedAt,
  };
  state.messageQualityReviews.unshift(review);
  return review;
}

function calculateResourceCosts(startSnapshot: ResourceSnapshot, endSnapshot: ResourceSnapshot) {
  const durationHours = Math.max(
    1 / 3600,
    (new Date(endSnapshot.timestamp).getTime() - new Date(startSnapshot.timestamp).getTime()) / 3600000
  );
  const cpuMicros = Math.max(
    0,
    endSnapshot.cpuUserMicros +
      endSnapshot.cpuSystemMicros -
      startSnapshot.cpuUserMicros -
      startSnapshot.cpuSystemMicros
  );
  const cpuCoreHours = cpuMicros / 1_000_000 / 3600;
  const averageRssBytes = Math.max(0, (startSnapshot.rssBytes + endSnapshot.rssBytes) / 2);
  const ramGbHours = (averageRssBytes / 1024 / 1024 / 1024) * durationHours;
  const storageGbHours = (Math.max(startSnapshot.ledgerBytes, endSnapshot.ledgerBytes) / 1024 / 1024 / 1024) * durationHours;
  const bandwidthGb = Math.max(0, endSnapshot.observedApiBytes - startSnapshot.observedApiBytes) / 1024 / 1024 / 1024;
  const estimatedKwh = cpuCoreHours * 0.015 + ramGbHours * 0.0005 + storageGbHours * 0.00002 + bandwidthGb * 0.0001;
  const rawResourceCost =
    cpuCoreHours * 0.02 +
    ramGbHours * 0.01 +
    storageGbHours * 0.0005 +
    bandwidthGb * 0.08 +
    estimatedKwh * 0.12;

  return {
    cpuCoreHours,
    ramGbHours,
    storageGbHours,
    bandwidthGb,
    estimatedKwh,
    rawResourceCost,
    finalCost: rawResourceCost * 2,
  };
}

function jsonError(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

function route(handler: (req: Request, res: Response, state: LedgerState) => unknown) {
  return (req: Request, res: Response) => {
    try {
      if (req.body && Object.keys(req.body as Record<string, unknown>).length > 0) {
        observedApiBytes += Buffer.byteLength(JSON.stringify(req.body), "utf8");
      }
      const state = readState();
      const result = handler(req, res, state);
      if (!res.headersSent) {
        writeState(state);
        observedApiBytes += Buffer.byteLength(JSON.stringify(result), "utf8");
        res.json(result);
      }
    } catch (error) {
      console.error(error);
      jsonError(res, 500, "Internal ledger error");
    }
  };
}

function buildUsageReport(details: NonNullable<ReturnType<typeof attachCampaignDetails>>, generatedAt = now()) {
  const totalRawResourceCost = details.billingRecords.reduce((sum, item) => sum + item.rawResourceCost, 0);
  const totalFinalCost = details.billingRecords.reduce((sum, item) => sum + item.finalCost, 0);

  return {
    reportId: `usage-${details.campaign.id}-${new Date(generatedAt).getTime()}`,
    generatedAt,
    campaign: details.campaign,
    totals: {
      mentors: details.campaign.totalMentors,
      messagesDrafted: details.campaign.messagesDrafted,
      messagesApproved: details.campaign.messagesApproved,
      messagesSent: details.campaign.messagesSent,
      responsesReceived: details.campaign.responsesReceived,
      followUpsDue: details.campaign.followUpsDue,
      outcomesRecorded: details.outcomes.length,
      rawResourceCost: totalRawResourceCost,
      finalCost: totalFinalCost,
      currency: "EUR" as const,
    },
    pricingFormula: PRICING_FORMULA,
    measurementNote: "This report uses stored process-level local measurements. It is not an external charge.",
    billingRecords: details.billingRecords,
    invoiceRecords: details.invoiceRecords,
  };
}

function createInvoiceRecord(state: LedgerState, campaignId: string) {
  const details = attachCampaignDetails(state, campaignId);
  if (!details) return null;
  const generatedAt = now();
  const usageReport = buildUsageReport(details, generatedAt);
  const invoiceRecord: InvoiceRecord = {
    id: randomUUID(),
    campaignId,
    invoiceNumber: `MARO-${new Date(generatedAt).toISOString().slice(0, 10).replaceAll("-", "")}-${String(state.invoiceRecords.length + 1).padStart(4, "0")}`,
    status: "generated",
    currency: "EUR",
    rawResourceCost: usageReport.totals.rawResourceCost,
    finalCost: usageReport.totals.finalCost,
    pricingFormula: PRICING_FORMULA,
    measurementNote: usageReport.measurementNote,
    lineItemsJson: details.billingRecords.map((record) => ({
      billingRecordId: record.id,
      resourceUsageSessionId: record.resourceUsageSessionId,
      rawResourceCost: record.rawResourceCost,
      finalCost: record.finalCost,
      generatedAt: record.generatedAt,
    })),
    totalsJson: {
      mentors: usageReport.totals.mentors,
      messagesDrafted: usageReport.totals.messagesDrafted,
      messagesApproved: usageReport.totals.messagesApproved,
      messagesSent: usageReport.totals.messagesSent,
      responsesReceived: usageReport.totals.responsesReceived,
      followUpsDue: usageReport.totals.followUpsDue,
      outcomesRecorded: usageReport.totals.outcomesRecorded,
    },
    generatedAt,
    createdAt: generatedAt,
  };
  state.invoiceRecords.unshift(invoiceRecord);
  usageReport.invoiceRecords = [invoiceRecord, ...details.invoiceRecords];
  audit(state, "generated_invoice_report", "invoiceRecord", invoiceRecord.id, { invoiceRecord, usageReport }, { riskLevel: "medium" });
  return { invoiceRecord, usageReport };
}

function requireCampaign(state: LedgerState, campaignId: string) {
  return state.campaigns.find((item) => item.id === campaignId);
}

function requireProject(state: LedgerState, projectId: string) {
  return state.projects.find((item) => item.id === projectId);
}

function requireMessage(state: LedgerState, messageId: string) {
  return state.messageDrafts.find((item) => item.id === messageId);
}

function routeId(req: Request) {
  return String(req.params.id || "");
}

function duplicateMentorProfiles(state: LedgerState, campaignId: string, body: Record<string, unknown>) {
  const name = normalize(String(body.name || ""));
  const company = normalize(String(body.company || body.organization || ""));
  const profileUrl = normalize(String(body.profileUrl || ""));

  return state.mentorProfiles.filter((mentor) => {
    if (mentor.campaignId !== campaignId) return false;
    const rawCompany = typeof mentor.rawProfileJson.company === "string" ? mentor.rawProfileJson.company : "";
    const sameNameCompany = normalize(mentor.name) === name && normalize(rawCompany) === company;
    const sameProfileUrl = profileUrl.length > 0 && normalize(mentor.profileUrl || "") === profileUrl;
    return sameNameCompany || sameProfileUrl;
  });
}

function relatedMentorProfileIds(state: LedgerState, mentor: MentorProfile) {
  const profileUrl = normalize(mentor.profileUrl || "");
  return new Set(
    state.mentorProfiles
      .filter((item) => {
        if (item.campaignId !== mentor.campaignId) return false;
        const sameIdentity = item.mentorIdentityId === mentor.mentorIdentityId;
        const sameProfileUrl = profileUrl.length > 0 && normalize(item.profileUrl || "") === profileUrl;
        return sameIdentity || sameProfileUrl;
      })
      .map((item) => item.id)
  );
}

function relatedMentorProfiles(state: LedgerState, mentor: MentorProfile) {
  const relatedIds = relatedMentorProfileIds(state, mentor);
  return state.mentorProfiles
    .filter((item) => relatedIds.has(item.id))
    .sort((left, right) => {
      const createdDelta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      return createdDelta !== 0 ? createdDelta : left.id.localeCompare(right.id);
    });
}

function canonicalMentorProfileForPerson(state: LedgerState, mentor: MentorProfile) {
  const relatedProfiles = relatedMentorProfiles(state, mentor);
  return relatedProfiles.length > 1 ? relatedProfiles[0] : null;
}

function activeDraftForMentorPerson(state: LedgerState, campaignId: string, mentor: MentorProfile) {
  const relatedIds = relatedMentorProfileIds(state, mentor);
  return state.messageDrafts.find(
    (message) =>
      message.campaignId === campaignId &&
      relatedIds.has(message.mentorProfileId) &&
      message.status !== "rejected"
  );
}

function sentDraftForMentorPerson(state: LedgerState, draft: MessageDraft) {
  const mentor = state.mentorProfiles.find((item) => item.id === draft.mentorProfileId);
  if (!mentor) return null;
  const relatedIds = relatedMentorProfileIds(state, mentor);
  return state.messageDrafts.find(
    (message) =>
      message.id !== draft.id &&
      message.campaignId === draft.campaignId &&
      relatedIds.has(message.mentorProfileId) &&
      message.status === "sent"
  ) || null;
}

function createMentorRecord(state: LedgerState, campaign: OutreachCampaign, body: Record<string, unknown>) {
  const name = String(body?.name || "").trim();
  if (!name) {
    return { error: "Mentor name is required" };
  }
  const company = String(body?.company || body?.organization || "").trim();
  const normalizedName = normalize(name);
  const normalizedCompany = normalize(company);
  let identity = state.mentorIdentities.find(
    (item) => item.normalizedName === normalizedName && item.normalizedCompany === normalizedCompany
  );
  const duplicateProfiles = duplicateMentorProfiles(state, campaign.id, { ...body, name, company });
  const requestedSourceRecordId = typeof body?.sourceRecordId === "string" ? body.sourceRecordId : "";
  const sourceRecord = requestedSourceRecordId
    ? state.mentorSources.find((item) => item.id === requestedSourceRecordId && item.campaignId === campaign.id) || null
    : null;

  if (!identity) {
    const createdAt = now();
    identity = {
      id: randomUUID(),
      normalizedName,
      normalizedCompany,
      createdAt,
      updatedAt: createdAt,
    };
    state.mentorIdentities.push(identity);
  }

  const createdAt = now();
  const mentor: MentorProfile = {
    id: randomUUID(),
    campaignId: campaign.id,
    mentorIdentityId: identity.id,
    source: String(body?.source || sourceRecord?.sourceType || campaign.source || "manual"),
    sourceRecordId: sourceRecord?.id || null,
    sourceProfileId: body?.sourceProfileId ? String(body.sourceProfileId) : null,
    profileUrl: safeProfileUrl(body?.profileUrl),
    name,
    headline: String(body?.headline || body?.role || "Mentor"),
    bio: String(body?.bio || body?.goal || ""),
    skills: stringList(body?.skills),
    industries: stringList(body?.industries),
    location: String(body?.location || ""),
    availability: String(body?.availability || "Unknown"),
    contactMethod: String(body?.contactMethod || "manual"),
    rawProfileJson: { ...body, sourceRecordId: sourceRecord?.id || null, company },
    stage: parseMentorStage(body?.stage) || "matched",
    notes: String(body?.notes || ""),
    createdAt,
    updatedAt: createdAt,
  };
  state.mentorProfiles.unshift(mentor);
  const assessmentInput = scoreMentor(campaign, mentor);
  const assessment: MatchAssessment = {
    id: randomUUID(),
    mentorProfileId: mentor.id,
    campaignId: campaign.id,
    ...assessmentInput,
    createdAt,
  };
  state.matchAssessments.unshift(assessment);
  recalcCampaign(state, campaign.id);
  audit(state, "created_mentor_profile", "mentorProfile", mentor.id, { mentor, duplicateCount: duplicateProfiles.length });
  return { mentor, assessment, duplicateCount: duplicateProfiles.length };
}

function resolveDuplicateMentorRecord(state: LedgerState, mentor: MentorProfile, body: Record<string, unknown>) {
  if (mentor.stage === "closed") {
    return { error: "Duplicate mentor profile is already resolved", status: 409 };
  }
  const canonicalMentorProfileId = body?.canonicalMentorProfileId ? String(body.canonicalMentorProfileId) : "";
  const canonicalMentor = canonicalMentorProfileId
    ? state.mentorProfiles.find((item) => item.id === canonicalMentorProfileId)
    : canonicalMentorProfileForPerson(state, mentor);
  if (!canonicalMentor || canonicalMentor.id === mentor.id || canonicalMentor.campaignId !== mentor.campaignId) {
    return { error: "Valid canonical duplicate mentor profile is required", status: 400 };
  }
  if (!relatedMentorProfileIds(state, mentor).has(canonicalMentor.id)) {
    return { error: "Selected canonical mentor is not a duplicate match", status: 409 };
  }

  const decidedAt = now();
  const beforeMentor = { ...mentor };
  const beforeFollowUps = state.followUpPlans
    .filter((followUp) => followUp.mentorProfileId === mentor.id && followUp.status === "scheduled")
    .map((followUp) => ({ ...followUp }));
  mentor.mentorIdentityId = canonicalMentor.mentorIdentityId;
  mentor.stage = "closed";
  mentor.notes = [
    mentor.notes,
    `Duplicate resolved into ${canonicalMentor.name}${body?.resolutionNote ? `: ${String(body.resolutionNote)}` : ""}`,
  ].filter(Boolean).join("\n");
  mentor.updatedAt = decidedAt;

  for (const followUp of state.followUpPlans) {
    if (followUp.mentorProfileId === mentor.id && followUp.status === "scheduled") {
      followUp.status = "cancelled";
      followUp.updatedAt = decidedAt;
    }
  }

  recalcCampaign(state, mentor.campaignId);
  audit(
    state,
    "resolved_duplicate_mentor_profile",
    "mentorProfile",
    mentor.id,
    { mentor, canonicalMentor, cancelledFollowUps: beforeFollowUps.length },
    { beforeState: { mentor: beforeMentor, followUps: beforeFollowUps }, riskLevel: "medium" }
  );
  return { mentor, canonicalMentor, cancelledFollowUps: beforeFollowUps.length };
}

function createSourceRecord(state: LedgerState, campaign: OutreachCampaign, body: Record<string, unknown>) {
  const createdAt = now();
  const name = String(body?.name || "").trim();
  if (!name) return { error: "Source name is required", status: 400 };
  const status = sourceStatus(body?.status);
  const source: MentorSource = {
    id: randomUUID(),
    campaignId: campaign.id,
    name,
    sourceType: String(body?.sourceType || campaign.source || "manual").trim() || "manual",
    searchQuery: String(body?.searchQuery || "").trim(),
    status,
    resultsFound: parseNonNegativeInteger(body?.resultsFound),
    importedCount: parseNonNegativeInteger(body?.importedCount),
    notes: String(body?.notes || "").trim(),
    searchedAt: status === "planned" ? null : String(body?.searchedAt || createdAt),
    createdAt,
    updatedAt: createdAt,
  };
  state.mentorSources.unshift(source);
  audit(state, "created_mentor_source", "mentorSource", source.id, source, { riskLevel: "low" });
  return { source };
}

function updateSourceRecord(state: LedgerState, sourceId: string, body: Record<string, unknown>) {
  const source = state.mentorSources.find((item) => item.id === sourceId);
  if (!source) return { error: "Source record not found", status: 404 };
  const before = { ...source };
  if (typeof body?.name === "string" && body.name.trim()) source.name = body.name.trim();
  if (typeof body?.sourceType === "string") source.sourceType = body.sourceType.trim() || source.sourceType;
  if (typeof body?.searchQuery === "string") source.searchQuery = body.searchQuery.trim();
  if (typeof body?.status === "string") source.status = sourceStatus(body.status);
  if (body?.resultsFound !== undefined) source.resultsFound = parseNonNegativeInteger(body.resultsFound);
  if (body?.importedCount !== undefined) source.importedCount = parseNonNegativeInteger(body.importedCount);
  if (typeof body?.notes === "string") source.notes = body.notes.trim();
  if (typeof body?.searchedAt === "string") {
    source.searchedAt = body.searchedAt.trim() || null;
  } else if (source.status !== "planned" && !source.searchedAt) {
    source.searchedAt = now();
  }
  source.updatedAt = now();
  audit(state, "updated_mentor_source", "mentorSource", source.id, source, { beforeState: before, riskLevel: "low" });
  return { source };
}

function createMessageDraftRecord(state: LedgerState, campaign: OutreachCampaign, body: Record<string, unknown>) {
  const mentor = state.mentorProfiles.find((item) => item.id === String(body?.mentorProfileId));
  if (!mentor || mentor.campaignId !== campaign.id) {
    return { error: "Valid mentorProfileId is required" };
  }
  const duplicateDraft = activeDraftForMentorPerson(state, campaign.id, mentor);
  if (duplicateDraft) {
    return {
      error: "Duplicate outreach guard: this mentor identity already has an active or sent draft in this campaign.",
      status: 409,
    };
  }
  const createdAt = now();
  const assessment = state.matchAssessments.find((item) => item.mentorProfileId === mentor.id);
  const subject = String(body?.subject || `Quick MicroMentor question for ${firstName(mentor.name)}`);
  const messageBody = String(
    body?.body ||
      buildFirstTouchDraft(campaign, mentor, assessment)
  );
  const draft: MessageDraft = {
    id: randomUUID(),
    campaignId: campaign.id,
    mentorProfileId: mentor.id,
    subject,
    body: messageBody,
    language: String(body?.language || "en"),
    status: "draft",
    generatedBy: "maro-template-engine",
    createdAt,
    updatedAt: createdAt,
  };
  mentor.stage = "drafted";
  mentor.updatedAt = createdAt;
  state.messageDrafts.unshift(draft);
  const qualityReview = upsertMessageQualityReview(state, draft);
  recalcCampaign(state, campaign.id);
  audit(state, "created_message_draft", "messageDraft", draft.id, { draft, qualityReview });
  return { draft, qualityReview };
}

function createFollowUpDraftRecord(state: LedgerState, followUp: FollowUpPlan, body: Record<string, unknown>) {
  if (followUp.status !== "scheduled") {
    return { error: "Only scheduled follow-ups can be drafted", status: 409 };
  }
  const campaign = requireCampaign(state, followUp.campaignId);
  if (!campaign) return { error: "Campaign not found", status: 404 };
  const mentor = state.mentorProfiles.find((item) => item.id === followUp.mentorProfileId && item.campaignId === campaign.id);
  if (!mentor) return { error: "Follow-up mentor not found", status: 404 };
  const linkedDraft = followUp.messageDraftId ? state.messageDrafts.find((item) => item.id === followUp.messageDraftId) : null;
  if (linkedDraft && linkedDraft.generatedBy === "maro-follow-up-engine" && linkedDraft.status !== "rejected") {
    return { error: "Follow-up already has an active linked draft", status: 409 };
  }

  const createdAt = now();
  const draft: MessageDraft = {
    id: randomUUID(),
    campaignId: campaign.id,
    mentorProfileId: mentor.id,
    subject: String(body?.subject || `Following up on ${campaign.title}`),
    body: String(body?.body || followUp.suggestedMessage || buildFollowUpSuggestion(campaign, mentor)),
    language: String(body?.language || "en"),
    status: "draft",
    generatedBy: "maro-follow-up-engine",
    createdAt,
    updatedAt: createdAt,
  };
  const beforeFollowUp = { ...followUp };
  followUp.messageDraftId = draft.id;
  followUp.updatedAt = createdAt;
  mentor.stage = "follow_up";
  mentor.updatedAt = createdAt;
  state.messageDrafts.unshift(draft);
  const qualityReview = upsertMessageQualityReview(state, draft);
  recalcCampaign(state, campaign.id);
  audit(state, "created_follow_up_draft", "messageDraft", draft.id, { draft, followUp, qualityReview }, { beforeState: beforeFollowUp, riskLevel: "medium" });
  return { draft, followUp, qualityReview };
}

export function registerLedgerRoutes(app: Express) {
  app.get("/api/health", route((_req, _res, state) => ({
    ok: true,
    service: "maro-ledger",
    schemaVersion: state.schemaVersion,
    persistence: storageStatus().persistence,
    storage: storageStatus(),
    pricingFormula: PRICING_FORMULA,
    timestamp: now(),
  })));

  app.get("/api/workspace/backup", route((_req, _res, state) => {
    audit(state, "exported_workspace_backup", "workspace", "local-ledger", workspaceSummary(state), { riskLevel: "medium" });
    return {
      kind: "maro-workspace-backup",
      schemaVersion: state.schemaVersion,
      exportedAt: now(),
      summary: workspaceSummary(state),
      ledger: state,
    };
  }));

  app.post("/api/workspace/restore/preview", route((req, res) => {
    const validation = validateWorkspaceBackup(req.body || {});
    if (!("state" in validation)) return jsonError(res, 400, String(validation.error));
    return {
      valid: true,
      summary: workspaceSummary(validation.state),
    };
  }));

  app.post("/api/workspace/restore", route((req, res, state) => {
    if (req.body?.confirm !== true) return jsonError(res, 400, "Restore requires confirm=true");
    const validation = validateWorkspaceBackup(req.body || {});
    if (!("state" in validation)) return jsonError(res, 400, String(validation.error));
    const before = workspaceSummary(state);
    replaceState(state, validation.state);
    audit(state, "restored_workspace_backup", "workspace", "local-ledger", workspaceSummary(state), {
      beforeState: before,
      riskLevel: "high",
    });
    return {
      restored: true,
      summary: workspaceSummary(state),
    };
  }));

  app.post("/api/workspace/reset", route((req, res, state) => {
    if (req.body?.confirm !== true) return jsonError(res, 400, "Reset requires confirm=true");
    const scope = String(req.body?.scope || "");
    if (!["queue", "mentors", "workspace"].includes(scope)) {
      return jsonError(res, 400, "Reset scope must be queue, mentors, or workspace");
    }
    resetWorkspaceScope(state, scope as WorkspaceResetScope);
    return {
      reset: true,
      scope,
      summary: workspaceSummary(state),
    };
  }));

  app.get("/api/ledger/summary", route((_req, _res, state) => {
    state.campaigns.forEach((campaign) => recalcCampaign(state, campaign.id));
    const activeCampaigns = state.campaigns.filter((campaign) => campaign.status === "active");
    const nextActions = buildNextActionRecommendations(state);
    const totals = state.campaigns.reduce(
      (acc, campaign) => ({
        mentors: acc.mentors + campaign.totalMentors,
        strongMatches:
          acc.strongMatches +
          state.matchAssessments.filter(
            (item) => item.campaignId === campaign.id && item.score >= campaignFitThreshold(campaign)
          ).length,
        drafts: acc.drafts + campaign.messagesDrafted,
        approvals: acc.approvals + campaign.messagesApproved,
        sent: acc.sent + campaign.messagesSent,
        responses: acc.responses + campaign.responsesReceived,
        followUpsDue: acc.followUpsDue + campaign.followUpsDue,
        finalCost: acc.finalCost + state.billingRecords.filter((item) => item.campaignId === campaign.id).reduce((sum, item) => sum + item.finalCost, 0),
        nextActions: acc.nextActions + nextActions.filter((item) => item.campaignId === campaign.id).length,
      }),
      { mentors: 0, strongMatches: 0, drafts: 0, approvals: 0, sent: 0, responses: 0, followUpsDue: 0, finalCost: 0, nextActions: 0 }
    );

    return {
      activeCampaigns,
      totals,
      nextActions: nextActions.slice(0, 8),
      recentActivity: state.auditEvents.slice(0, 8),
    };
  }));

  app.get("/api/actions", route((req, res, state) => {
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : undefined;
    if (campaignId && !requireCampaign(state, campaignId)) {
      return jsonError(res, 404, "Campaign not found");
    }
    return { actions: buildNextActionRecommendations(state, campaignId) };
  }));

  app.get("/api/integrations/hai/status", route((req, _res, state) => {
    const includeArchived = req.query.includeArchived === "true";
    return buildHaiIntegrationStatus(state, includeArchived);
  }));

  app.get("/api/projects", route((_req, _res, state) => ({ projects: state.projects })));

  app.post("/api/projects", route((req, res, state) => {
    const title = String(req.body?.title || "").trim();
    if (!title) return jsonError(res, 400, "Project title is required");
    const createdAt = now();
    const project: OutreachProject = {
      id: randomUUID(),
      userId: DEFAULT_USER_ID,
      title,
      description: String(req.body?.description || ""),
      createdAt,
      updatedAt: createdAt,
    };
    state.projects.unshift(project);
    audit(state, "created_project", "project", project.id, project);
    return { project };
  }));

  app.patch("/api/projects/:id", route((req, res, state) => {
    const project = state.projects.find((item) => item.id === routeId(req));
    if (!project) return jsonError(res, 404, "Project not found");
    const before = { ...project };
    if (typeof req.body?.title === "string" && req.body.title.trim()) {
      project.title = req.body.title.trim();
    }
    if (typeof req.body?.description === "string") {
      project.description = req.body.description;
    }
    project.updatedAt = now();
    audit(state, "updated_project", "project", project.id, project, { beforeState: before });
    return { project };
  }));

  app.get("/api/campaigns", route((_req, _res, state) => {
    state.campaigns.forEach((campaign) => recalcCampaign(state, campaign.id));
    return { campaigns: state.campaigns };
  }));

  app.post("/api/campaigns", route((req, res, state) => {
    const title = String(req.body?.title || "").trim();
    const goal = String(req.body?.goal || "").trim();
    if (!title || !goal) return jsonError(res, 400, "Campaign title and goal are required");
    const projectId = String(req.body?.projectId || state.projects[0]?.id || DEFAULT_PROJECT_ID);
    if (!requireProject(state, projectId)) return jsonError(res, 404, "Project not found");
    const createdAt = now();
    const campaign: OutreachCampaign = {
      id: randomUUID(),
      userId: DEFAULT_USER_ID,
      projectId,
      title,
      goal,
      targetMentorType: String(req.body?.targetMentorType || "Relevant mentor or advisor"),
      status: "active",
      source: String(req.body?.source || "manual"),
      criteriaJson: campaignCriteria(req.body?.criteriaJson),
      totalMentors: 0,
      messagesDrafted: 0,
      messagesApproved: 0,
      messagesSent: 0,
      responsesReceived: 0,
      followUpsDue: 0,
      createdAt,
      updatedAt: createdAt,
    };
    state.campaigns.unshift(campaign);
    audit(state, "created_campaign", "campaign", campaign.id, campaign);
    return { campaign };
  }));

  app.patch("/api/campaigns/:id", route((req, res, state) => {
    const campaign = requireCampaign(state, routeId(req));
    if (!campaign) return jsonError(res, 404, "Campaign not found");
    const before = { ...campaign };
    const beforeScoringInput = campaignScoringSignature(campaign);
    if (typeof req.body?.title === "string" && req.body.title.trim()) campaign.title = req.body.title.trim();
    if (typeof req.body?.goal === "string" && req.body.goal.trim()) campaign.goal = req.body.goal.trim();
    if (typeof req.body?.targetMentorType === "string" && req.body.targetMentorType.trim()) {
      campaign.targetMentorType = req.body.targetMentorType.trim();
    }
    if (typeof req.body?.source === "string") campaign.source = req.body.source;
    if (typeof req.body?.projectId === "string") {
      if (!requireProject(state, req.body.projectId)) return jsonError(res, 404, "Project not found");
      campaign.projectId = req.body.projectId;
    }
    if (["active", "paused", "completed", "archived"].includes(String(req.body?.status))) {
      const nextStatus = String(req.body.status) as CampaignStatus;
      if (nextStatus === "completed") {
        const readiness = buildCampaignReadiness(state, campaign.id);
        if (readiness.status !== "ready") {
          return jsonError(
            res,
            409,
            `Campaign cannot be marked completed until readiness is ready. ${readiness.blockers} blockers and ${readiness.attentionItems} attention items remain.`
          );
        }
      }
      campaign.status = nextStatus;
    }
    if (req.body?.criteriaJson && typeof req.body.criteriaJson === "object") {
      campaign.criteriaJson = campaignCriteria(req.body.criteriaJson);
    }
    const afterScoringInput = campaignScoringSignature(campaign);
    const rescoredMentors = beforeScoringInput === afterScoringInput ? 0 : rescoreCampaignMentors(state, campaign);
    campaign.updatedAt = now();
    recalcCampaign(state, campaign.id);
    audit(state, "updated_campaign", "campaign", campaign.id, { campaign, rescoredMentors }, { beforeState: before, riskLevel: "medium" });
    return { campaign, rescoredMentors };
  }));

  app.get("/api/campaigns/:id", route((req, res, state) => {
    const details = attachCampaignDetails(state, routeId(req));
    return details || jsonError(res, 404, "Campaign not found");
  }));

  app.get("/api/campaigns/:id/actions", route((req, res, state) => {
    const campaignId = routeId(req);
    if (!requireCampaign(state, campaignId)) return jsonError(res, 404, "Campaign not found");
    return { actions: buildNextActionRecommendations(state, campaignId) };
  }));

  app.post("/api/campaigns/:id/mentors", route((req, res, state) => {
    const campaign = requireCampaign(state, routeId(req));
    if (!campaign) return jsonError(res, 404, "Campaign not found");
    const sourceRecordId = typeof req.body?.sourceRecordId === "string" ? req.body.sourceRecordId : "";
    if (sourceRecordId && !state.mentorSources.some((item) => item.id === sourceRecordId && item.campaignId === campaign.id)) {
      return jsonError(res, 400, "Source record does not belong to this campaign");
    }
    const result = createMentorRecord(state, campaign, req.body || {});
    return "error" in result ? jsonError(res, 400, String(result.error)) : result;
  }));

  app.get("/api/campaigns/:id/mentors", route((req, res, state) => {
    const campaignId = routeId(req);
    if (!requireCampaign(state, campaignId)) return jsonError(res, 404, "Campaign not found");
    return {
      mentors: state.mentorProfiles.filter((item) => item.campaignId === campaignId),
      assessments: state.matchAssessments.filter((item) => item.campaignId === campaignId),
    };
  }));

  app.get("/api/campaigns/:id/sources", route((req, res, state) => {
    const campaignId = routeId(req);
    if (!requireCampaign(state, campaignId)) return jsonError(res, 404, "Campaign not found");
    return { sources: state.mentorSources.filter((item) => item.campaignId === campaignId) };
  }));

  app.get("/api/campaigns/:id/discovery-plan", route((req, res, state) => {
    const campaign = requireCampaign(state, routeId(req));
    if (!campaign) return jsonError(res, 404, "Campaign not found");
    return { discoveryPlan: buildDiscoveryPlan(state, campaign) };
  }));

  app.post("/api/campaigns/:id/discovery-plan", route((req, res, state) => {
    const campaign = requireCampaign(state, routeId(req));
    if (!campaign) return jsonError(res, 404, "Campaign not found");
    if (req.body?.confirm !== true) return jsonError(res, 400, "Applying the discovery plan requires confirm=true");
    const discoveryPlan = buildDiscoveryPlan(state, campaign);
    const createdSources: MentorSource[] = [];
    for (const recommendation of discoveryPlan.sources.filter((source) => source.status === "recommended")) {
      const result = createSourceRecord(state, campaign, {
        name: recommendation.name,
        sourceType: recommendation.sourceType,
        searchQuery: recommendation.searchQuery,
        status: "planned",
        resultsFound: 0,
        importedCount: 0,
        notes: `${recommendation.rationale} ${recommendation.privacyNote}`,
      });
      if ("error" in result) return jsonError(res, result.status ?? 400, result.error || "Discovery source creation failed");
      createdSources.push(result.source);
    }
    return {
      discoveryPlan: buildDiscoveryPlan(state, campaign),
      createdSources,
    };
  }));

  app.post("/api/campaigns/:id/sources", route((req, res, state) => {
    const campaign = requireCampaign(state, routeId(req));
    if (!campaign) return jsonError(res, 404, "Campaign not found");
    const result = createSourceRecord(state, campaign, req.body || {});
    return "error" in result ? jsonError(res, result.status ?? 400, result.error || "Source record failed") : result;
  }));

  app.patch("/api/sources/:id", route((req, res, state) => {
    const result = updateSourceRecord(state, routeId(req), req.body || {});
    return "error" in result ? jsonError(res, result.status ?? 400, result.error || "Source record update failed") : result;
  }));

  app.post("/api/campaigns/:id/mentors/import", route((req, res, state) => {
    const campaign = requireCampaign(state, routeId(req));
    if (!campaign) return jsonError(res, 404, "Campaign not found");
    const csvText = String(req.body?.csvText || "");
    const preview = req.body?.preview === true;
    if (!csvText.trim()) return jsonError(res, 400, "CSV text is required");

    const rows = parseCsv(csvText);
    if (rows.length < 2) return jsonError(res, 400, "CSV must include a header row and at least one mentor row");
    const headers = rows[0].map((header) => normalize(header));
    const rawColumnMap = req.body?.columnMap && typeof req.body.columnMap === "object" ? req.body.columnMap as Record<string, unknown> : {};
    const mappedHeader = (name: string) => {
      const value = rawColumnMap[name];
      return typeof value === "string" ? normalize(value) : "";
    };
    const field = (row: string[], name: string, aliases: string[]) => {
      const mapped = mappedHeader(name);
      if (mapped) {
        const mappedIndex = headers.indexOf(mapped);
        if (mappedIndex >= 0) return row[mappedIndex] || "";
      }
      for (const alias of aliases) {
        const index = headers.indexOf(alias);
        if (index >= 0) return row[index] || "";
      }
      return "";
    };

    const imported: MentorProfile[] = [];
    const skipped: Array<{ row: number; reason: string; name: string }> = [];
    const plannedKeys = new Set<string>();
    const sourceRecordId = typeof req.body?.sourceRecordId === "string" ? req.body.sourceRecordId : "";
    const sourceRecord = sourceRecordId ? state.mentorSources.find((item) => item.id === sourceRecordId && item.campaignId === campaign.id) : null;
    if (sourceRecordId && !sourceRecord) return jsonError(res, 400, "Source record does not belong to this campaign");

    rows.slice(1).forEach((row, index) => {
      const payload = {
        name: field(row, "name", ["name", "mentor", "full name"]),
        company: field(row, "company", ["company", "organization", "organisation"]),
        headline: field(row, "headline", ["headline", "role", "title"]),
        bio: field(row, "bio", ["bio", "goal", "context", "description"]),
        skills: field(row, "skills", ["skills", "skill"]),
        industries: field(row, "industries", ["industries", "industry", "sectors", "sector"]),
        location: field(row, "location", ["location", "city", "region", "country"]),
        profileUrl: field(row, "profileUrl", ["profileurl", "profile url", "url", "source url", "profile"]),
        notes: field(row, "notes", ["notes", "note"]),
        sourceRecordId: sourceRecord?.id || null,
        source: field(row, "source", ["source"]) || sourceRecord?.sourceType || campaign.source,
        priority: field(row, "priority", ["priority"]),
        stage: field(row, "stage", ["stage", "status", "outcome"]),
      };
      const rowNumber = index + 2;
      if (!payload.name.trim()) {
        skipped.push({ row: rowNumber, reason: "missing_name", name: "" });
        return;
      }
      const key = `${normalize(payload.name)}::${normalize(payload.company)}::${normalize(payload.profileUrl)}`;
      const duplicates = duplicateMentorProfiles(state, campaign.id, payload);
      if (duplicates.length > 0 || plannedKeys.has(key)) {
        skipped.push({ row: rowNumber, reason: "duplicate", name: payload.name });
        return;
      }
      plannedKeys.add(key);
      if (!preview) {
        const result = createMentorRecord(state, campaign, payload);
        if ("mentor" in result && result.mentor) imported.push(result.mentor);
      }
    });

    if (!preview) {
      if (sourceRecord) {
        updateSourceRecord(state, sourceRecord.id, {
          status: "imported",
          importedCount: sourceRecord.importedCount + imported.length,
          resultsFound: Math.max(sourceRecord.resultsFound, rows.length - 1),
        });
      }
      recalcCampaign(state, campaign.id);
      audit(state, "imported_mentor_csv", "campaign", campaign.id, { imported: imported.length, skipped }, { riskLevel: "medium" });
    }

    return {
      preview,
      totalRows: Math.max(0, rows.length - 1),
      importedCount: preview ? Math.max(0, rows.length - 1 - skipped.length) : imported.length,
      skipped,
      imported,
    };
  }));

  app.get("/api/campaigns/:id/mentors/export", route((req, res, state) => {
    const campaignId = routeId(req);
    const campaign = requireCampaign(state, campaignId);
    if (!campaign) return jsonError(res, 404, "Campaign not found");
    const mentors = state.mentorProfiles.filter((item) => item.campaignId === campaignId);
    const assessments = state.matchAssessments.filter((item) => item.campaignId === campaignId);
    audit(state, "exported_mentor_csv", "campaign", campaign.id, { mentorCount: mentors.length }, { riskLevel: "high" });
    return {
      filename: `${exportSlug(campaign.title)}-mentors.csv`,
      csv: mentorsToCsv(mentors, assessments, state.mentorSources.filter((item) => item.campaignId === campaignId)),
    };
  }));

  app.get("/api/campaigns/:id/history/export", route((req, res, state) => {
    const campaignId = routeId(req);
    const campaign = requireCampaign(state, campaignId);
    if (!campaign) return jsonError(res, 404, "Campaign not found");
    const mentorCount = state.mentorProfiles.filter((item) => item.campaignId === campaignId).length;
    audit(state, "exported_campaign_history_csv", "campaign", campaign.id, { mentorCount }, { riskLevel: "high" });
    return {
      filename: `${exportSlug(campaign.title)}-campaign-history.csv`,
      csv: campaignHistoryToCsv(state, campaign),
    };
  }));

  app.get("/api/mentors", route((req, _res, state) => {
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : null;
    const mentors = campaignId
      ? state.mentorProfiles.filter((item) => item.campaignId === campaignId)
      : state.mentorProfiles;
    return { mentors };
  }));

  app.get("/api/mentors/:id", route((req, res, state) => {
    const mentor = state.mentorProfiles.find((item) => item.id === routeId(req));
    if (!mentor) return jsonError(res, 404, "Mentor not found");
    return {
      mentor,
      identity: state.mentorIdentities.find((item) => item.id === mentor.mentorIdentityId) || null,
      assessment: state.matchAssessments.find((item) => item.mentorProfileId === mentor.id) || null,
      messages: state.messageDrafts.filter((item) => item.mentorProfileId === mentor.id),
      responses: state.mentorResponses.filter((item) => item.mentorProfileId === mentor.id),
      followUps: state.followUpPlans.filter((item) => item.mentorProfileId === mentor.id),
      outcomes: state.outreachOutcomes.filter((item) => item.mentorProfileId === mentor.id),
      relationshipTimeline: buildMentorRelationshipTimeline(state, mentor),
    };
  }));

  app.get("/api/mentors/:id/timeline", route((req, res, state) => {
    const mentor = state.mentorProfiles.find((item) => item.id === routeId(req));
    if (!mentor) return jsonError(res, 404, "Mentor not found");
    return { relationshipTimeline: buildMentorRelationshipTimeline(state, mentor) };
  }));

  app.post("/api/mentors", route((req, res, state) => {
    const campaignId = String(req.body?.campaignId || state.campaigns[0]?.id || "");
    const campaign = requireCampaign(state, campaignId);
    if (!campaign) return jsonError(res, 404, "Campaign not found");
    const result = createMentorRecord(state, campaign, req.body || {});
    return "error" in result ? jsonError(res, 400, String(result.error)) : result;
  }));

  app.patch("/api/mentors/:id", route((req, res, state) => {
    const mentor = state.mentorProfiles.find((item) => item.id === routeId(req));
    if (!mentor) return jsonError(res, 404, "Mentor not found");
    const campaign = requireCampaign(state, mentor.campaignId);
    if (!campaign) return jsonError(res, 404, "Campaign not found");
    const before = { ...mentor };
    if (typeof req.body?.name === "string" && req.body.name.trim()) mentor.name = req.body.name.trim();
    if (typeof req.body?.headline === "string") mentor.headline = req.body.headline;
    if (typeof req.body?.bio === "string") mentor.bio = req.body.bio;
    if (typeof req.body?.profileUrl === "string") mentor.profileUrl = safeProfileUrl(req.body.profileUrl);
    if (typeof req.body?.source === "string") mentor.source = req.body.source;
    if (typeof req.body?.location === "string") mentor.location = req.body.location;
    if (typeof req.body?.availability === "string") mentor.availability = req.body.availability;
    if (typeof req.body?.contactMethod === "string") mentor.contactMethod = req.body.contactMethod;
    if (typeof req.body?.notes === "string") mentor.notes = req.body.notes;
    if (Array.isArray(req.body?.skills) || typeof req.body?.skills === "string") mentor.skills = stringList(req.body.skills);
    if (Array.isArray(req.body?.industries) || typeof req.body?.industries === "string") mentor.industries = stringList(req.body.industries);
    if (["new", "matched", "drafted", "approved", "contacted", "responded", "follow_up", "closed"].includes(String(req.body?.stage))) {
      mentor.stage = String(req.body.stage) as MentorStage;
    }
    mentor.updatedAt = now();
    const assessmentInput = scoreMentor(campaign, mentor);
    const assessment = state.matchAssessments.find((item) => item.mentorProfileId === mentor.id);
    if (assessment) {
      Object.assign(assessment, assessmentInput);
    } else {
      state.matchAssessments.unshift({
        id: randomUUID(),
        mentorProfileId: mentor.id,
        campaignId: mentor.campaignId,
        ...assessmentInput,
        createdAt: now(),
      });
    }
    recalcCampaign(state, mentor.campaignId);
    audit(state, "updated_mentor_profile", "mentorProfile", mentor.id, mentor, { beforeState: before, riskLevel: "medium" });
    return { mentor, assessment: state.matchAssessments.find((item) => item.mentorProfileId === mentor.id) };
  }));

  app.post("/api/mentors/:id/resolve-duplicate", route((req, res, state) => {
    const mentor = state.mentorProfiles.find((item) => item.id === routeId(req));
    if (!mentor) return jsonError(res, 404, "Mentor not found");
    const result = resolveDuplicateMentorRecord(state, mentor, req.body || {});
    if ("error" in result) {
      const status = "status" in result && typeof result.status === "number" ? result.status : 400;
      return jsonError(res, status, String(result.error));
    }
    return result;
  }));

  app.post("/api/campaigns/:id/messages", route((req, res, state) => {
    const campaign = requireCampaign(state, routeId(req));
    if (!campaign) return jsonError(res, 404, "Campaign not found");
    const result = createMessageDraftRecord(state, campaign, req.body || {});
    if ("error" in result) {
      const status = "status" in result && typeof result.status === "number" ? result.status : 400;
      return jsonError(res, status, String(result.error));
    }
    return result;
  }));

  app.get("/api/campaigns/:id/messages", route((req, res, state) => {
    const campaignId = routeId(req);
    if (!requireCampaign(state, campaignId)) return jsonError(res, 404, "Campaign not found");
    return { messages: state.messageDrafts.filter((item) => item.campaignId === campaignId) };
  }));

  app.get("/api/campaigns/:id/follow-ups", route((req, res, state) => {
    const campaignId = routeId(req);
    if (!requireCampaign(state, campaignId)) return jsonError(res, 404, "Campaign not found");
    return { followUps: state.followUpPlans.filter((item) => item.campaignId === campaignId) };
  }));

  app.get("/api/messages", route((_req, _res, state) => ({ messages: state.messageDrafts })));

  app.post("/api/messages", route((req, res, state) => {
    const campaignId = String(req.body?.campaignId || state.campaigns[0]?.id || "");
    const campaign = requireCampaign(state, campaignId);
    if (!campaign) return jsonError(res, 404, "Campaign not found");
    const result = createMessageDraftRecord(state, campaign, req.body || {});
    if ("error" in result) {
      const status = "status" in result && typeof result.status === "number" ? result.status : 400;
      return jsonError(res, status, String(result.error));
    }
    return result;
  }));

  app.patch("/api/messages/:id", route((req, res, state) => {
    const draft = requireMessage(state, routeId(req));
    if (!draft) return jsonError(res, 404, "Message draft not found");
    if (draft.status === "sent") return jsonError(res, 409, "Sent messages cannot be edited");
    const before = { ...draft };
    draft.subject = String(req.body?.subject ?? draft.subject);
    draft.body = String(req.body?.body ?? draft.body);
    draft.updatedAt = now();
    const qualityReview = upsertMessageQualityReview(state, draft);
    audit(state, "edited_message_draft", "messageDraft", draft.id, { draft, qualityReview }, { beforeState: before, riskLevel: "medium" });
    return { draft, qualityReview };
  }));

  app.post("/api/messages/:id/approve", route((req, res, state) => {
    const draft = requireMessage(state, routeId(req));
    if (!draft) return jsonError(res, 404, "Message draft not found");
    if (draft.status === "sent") return jsonError(res, 409, "Sent messages cannot be re-approved");
    const qualityReview = upsertMessageQualityReview(state, draft);
    if (qualityReview?.status === "blocked") {
      return jsonError(res, 409, `Message quality blocked approval: ${qualityReview.warningsJson.join(" ")}`);
    }
    const decidedAt = now();
    draft.status = "approved";
    draft.updatedAt = decidedAt;
    const approval: MessageApproval = {
      id: randomUUID(),
      messageDraftId: draft.id,
      decision: "approved",
      decisionReason: String(req.body?.decisionReason || "Approved after local review"),
      approvedSubjectSnapshot: draft.subject,
      approvedBodySnapshot: draft.body,
      decidedAt,
      createdAt: decidedAt,
    };
    state.messageApprovals.unshift(approval);
    const mentor = state.mentorProfiles.find((item) => item.id === draft.mentorProfileId);
    if (mentor) {
      mentor.stage = "approved";
      mentor.updatedAt = decidedAt;
    }
    recalcCampaign(state, draft.campaignId);
    audit(state, "approved_message", "messageDraft", draft.id, { approval, draft, qualityReview }, { riskLevel: "medium", approvalId: approval.id });
    return { draft, approval, qualityReview };
  }));

  app.post("/api/messages/:id/reject", route((req, res, state) => {
    const draft = requireMessage(state, routeId(req));
    if (!draft) return jsonError(res, 404, "Message draft not found");
    if (draft.status === "sent") return jsonError(res, 409, "Sent messages cannot be rejected");
    const decidedAt = now();
    draft.status = "rejected";
    draft.updatedAt = decidedAt;
    const approval: MessageApproval = {
      id: randomUUID(),
      messageDraftId: draft.id,
      decision: "rejected",
      decisionReason: String(req.body?.decisionReason || "Rejected during local review"),
      approvedSubjectSnapshot: "",
      approvedBodySnapshot: "",
      decidedAt,
      createdAt: decidedAt,
    };
    state.messageApprovals.unshift(approval);
    recalcCampaign(state, draft.campaignId);
    audit(state, "rejected_message", "messageDraft", draft.id, { approval, draft }, { riskLevel: "medium", approvalId: approval.id });
    return { draft, approval };
  }));

  app.post("/api/messages/:id/send-attempt", route((req, res, state) => {
    const draft = requireMessage(state, routeId(req));
    if (!draft) return jsonError(res, 404, "Message draft not found");
    if (draft.status !== "approved") {
      return jsonError(res, 409, "Message must be approved before manual send confirmation");
    }
    const campaign = requireCampaign(state, draft.campaignId);
    if (!campaign) return jsonError(res, 404, "Campaign not found");
    const createdAt = now();
    const priorAttempts = state.messageSendAttempts.filter((item) => item.messageDraftId === draft.id);
    const attemptStatus: SendStatus = req.body?.status === "failed" ? "failed" : "confirmed_sent";
    if (attemptStatus === "failed") {
      const errorMessage = String(req.body?.errorMessage || "").trim();
      if (!errorMessage) return jsonError(res, 400, "Failure reason is required");
      const attempt: MessageSendAttempt = {
        id: randomUUID(),
        messageDraftId: draft.id,
        mentorProfileId: draft.mentorProfileId,
        campaignId: draft.campaignId,
        status: "failed",
        channel: String(req.body?.channel || "manual"),
        startedAt: createdAt,
        finishedAt: createdAt,
        errorMessage,
        deliveryEvidence: "",
        retryCount: priorAttempts.length,
        createdAt,
      };
      state.messageSendAttempts.unshift(attempt);
      recalcCampaign(state, draft.campaignId);
      audit(state, "recorded_failed_send_attempt", "messageDraft", draft.id, { attempt, draft }, { riskLevel: "medium" });
      return { draft, attempt };
    }
    const evidence = String(req.body?.deliveryEvidence || "").trim();
    if (!evidence) return jsonError(res, 400, "Manual delivery evidence is required");
    if (sentDraftForMentorPerson(state, draft)) {
      return jsonError(res, 409, "Duplicate outreach guard: this mentor identity already has confirmed sent outreach in this campaign");
    }
    draft.status = "sent";
    draft.updatedAt = createdAt;
    const attempt: MessageSendAttempt = {
      id: randomUUID(),
      messageDraftId: draft.id,
      mentorProfileId: draft.mentorProfileId,
      campaignId: draft.campaignId,
      status: "confirmed_sent",
      channel: String(req.body?.channel || "manual"),
      startedAt: createdAt,
      finishedAt: createdAt,
      errorMessage: null,
      deliveryEvidence: evidence,
      retryCount: priorAttempts.length,
      createdAt,
    };
    state.messageSendAttempts.unshift(attempt);
    const mentor = state.mentorProfiles.find((item) => item.id === draft.mentorProfileId);
    if (mentor) {
      mentor.stage = "contacted";
      mentor.updatedAt = createdAt;
    }
    const followUp: FollowUpPlan = {
      id: randomUUID(),
      campaignId: draft.campaignId,
      mentorProfileId: draft.mentorProfileId,
      messageDraftId: draft.id,
      dueAt: addDays(new Date(createdAt), parsePositiveInteger(req.body?.followUpAfterDays, campaignFollowUpAfterDays(campaign))),
      status: "scheduled",
      suggestedMessage: buildFollowUpSuggestion(campaign, mentor),
      createdAt,
      updatedAt: createdAt,
    };
    state.followUpPlans.unshift(followUp);
    recalcCampaign(state, draft.campaignId);
    audit(state, "confirmed_manual_send", "messageDraft", draft.id, { attempt, followUp }, { riskLevel: "high" });
    return { draft, attempt, followUp };
  }));

  app.post("/api/responses", route((req, res, state) => {
    const campaignId = String(req.body?.campaignId || "");
    const mentorProfileId = String(req.body?.mentorProfileId || "");
    if (!requireCampaign(state, campaignId)) return jsonError(res, 404, "Campaign not found");
    const mentor = state.mentorProfiles.find((item) => item.id === mentorProfileId && item.campaignId === campaignId);
    if (!mentor) return jsonError(res, 400, "Valid mentorProfileId is required");
    const classification = (req.body?.classification || "unknown") as ResponseClassification;
    const response: MentorResponse = {
      id: randomUUID(),
      campaignId,
      mentorProfileId,
      messageDraftId: req.body?.messageDraftId ? String(req.body.messageDraftId) : null,
      classification,
      body: String(req.body?.body || ""),
      nextAction: String(req.body?.nextAction || (responseCancelsFollowUps(classification) ? "Do not follow up unless the mentor explicitly reopens the conversation." : "Review response and decide next action")),
      createdAt: now(),
    };
    state.mentorResponses.unshift(response);
    mentor.stage = responseCancelsFollowUps(classification) ? "closed" : "responded";
    mentor.updatedAt = response.createdAt;
    for (const followUp of state.followUpPlans) {
      if (followUp.mentorProfileId === mentor.id && followUp.status === "scheduled") {
        followUp.status = responseCancelsFollowUps(classification) ? "cancelled" : "completed";
        followUp.updatedAt = response.createdAt;
      }
    }
    recalcCampaign(state, campaignId);
    audit(state, "recorded_response", "mentorResponse", response.id, response, { riskLevel: "medium" });
    return { response };
  }));

  app.get("/api/responses", route((req, _res, state) => {
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : null;
    return {
      responses: campaignId ? state.mentorResponses.filter((item) => item.campaignId === campaignId) : state.mentorResponses,
    };
  }));

  app.get("/api/follow-ups", route((req, _res, state) => {
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : null;
    const dueOnly = req.query.due === "true";
    const currentTime = Date.now();
    let followUps = campaignId ? state.followUpPlans.filter((item) => item.campaignId === campaignId) : state.followUpPlans;
    if (dueOnly) {
      followUps = followUps.filter((item) => item.status === "scheduled" && new Date(item.dueAt).getTime() <= currentTime);
    }
    return { followUps };
  }));

  app.patch("/api/follow-ups/:id", route((req, res, state) => {
    const followUp = state.followUpPlans.find((item) => item.id === routeId(req));
    if (!followUp) return jsonError(res, 404, "Follow-up not found");
    const before = { ...followUp };
    if (req.body?.dueAt) followUp.dueAt = new Date(String(req.body.dueAt)).toISOString();
    if (typeof req.body?.suggestedMessage === "string") followUp.suggestedMessage = req.body.suggestedMessage;
    if (["scheduled", "completed", "cancelled"].includes(String(req.body?.status))) {
      followUp.status = String(req.body.status) as FollowUpStatus;
    }
    followUp.updatedAt = now();
    recalcCampaign(state, followUp.campaignId);
    audit(state, "updated_follow_up", "followUp", followUp.id, followUp, { beforeState: before, riskLevel: "medium" });
    return { followUp };
  }));

  app.post("/api/follow-ups/:id/draft", route((req, res, state) => {
    const followUp = state.followUpPlans.find((item) => item.id === routeId(req));
    if (!followUp) return jsonError(res, 404, "Follow-up not found");
    const result = createFollowUpDraftRecord(state, followUp, req.body || {});
    if ("error" in result) {
      const status = "status" in result && typeof result.status === "number" ? result.status : 400;
      return jsonError(res, status, String(result.error));
    }
    return result;
  }));

  app.post("/api/follow-ups/:id/complete", route((req, res, state) => {
    const followUp = state.followUpPlans.find((item) => item.id === routeId(req));
    if (!followUp) return jsonError(res, 404, "Follow-up not found");
    const before = { ...followUp };
    followUp.status = "completed";
    followUp.updatedAt = now();
    recalcCampaign(state, followUp.campaignId);
    audit(state, "completed_follow_up", "followUp", followUp.id, followUp, { beforeState: before, riskLevel: "medium" });
    return { followUp };
  }));

  app.post("/api/follow-ups/:id/cancel", route((req, res, state) => {
    const followUp = state.followUpPlans.find((item) => item.id === routeId(req));
    if (!followUp) return jsonError(res, 404, "Follow-up not found");
    const before = { ...followUp };
    followUp.status = "cancelled";
    followUp.updatedAt = now();
    recalcCampaign(state, followUp.campaignId);
    audit(state, "cancelled_follow_up", "followUp", followUp.id, followUp, { beforeState: before, riskLevel: "medium" });
    return { followUp };
  }));

  app.post("/api/follow-ups", route((req, res, state) => {
    const campaignId = String(req.body?.campaignId || "");
    const mentorProfileId = String(req.body?.mentorProfileId || "");
    const campaign = requireCampaign(state, campaignId);
    if (!campaign) return jsonError(res, 404, "Campaign not found");
    const mentor = state.mentorProfiles.find((item) => item.id === mentorProfileId && item.campaignId === campaignId);
    if (!mentor) {
      return jsonError(res, 400, "Valid mentorProfileId is required");
    }
    const createdAt = now();
    const followUp: FollowUpPlan = {
      id: randomUUID(),
      campaignId,
      mentorProfileId,
      messageDraftId: req.body?.messageDraftId ? String(req.body.messageDraftId) : null,
      dueAt: req.body?.dueAt ? new Date(String(req.body.dueAt)).toISOString() : addDays(new Date(), campaignFollowUpAfterDays(campaign)),
      status: "scheduled",
      suggestedMessage: String(req.body?.suggestedMessage || buildFollowUpSuggestion(campaign, mentor)),
      createdAt,
      updatedAt: createdAt,
    };
    state.followUpPlans.unshift(followUp);
    recalcCampaign(state, campaignId);
    audit(state, "scheduled_follow_up", "followUp", followUp.id, followUp, { riskLevel: "medium" });
    return { followUp };
  }));

  app.get("/api/outcomes", route((req, _res, state) => {
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : null;
    const mentorProfileId = typeof req.query.mentorProfileId === "string" ? req.query.mentorProfileId : null;
    let outcomes = state.outreachOutcomes;
    if (campaignId) outcomes = outcomes.filter((item) => item.campaignId === campaignId);
    if (mentorProfileId) outcomes = outcomes.filter((item) => item.mentorProfileId === mentorProfileId);
    return { outcomes };
  }));

  app.post("/api/outcomes", route((req, res, state) => {
    const campaignId = String(req.body?.campaignId || "");
    const mentorProfileId = String(req.body?.mentorProfileId || "");
    if (!requireCampaign(state, campaignId)) return jsonError(res, 404, "Campaign not found");
    const mentor = state.mentorProfiles.find((item) => item.id === mentorProfileId && item.campaignId === campaignId);
    if (!mentor) return jsonError(res, 400, "Valid mentorProfileId is required");
    const status = String(req.body?.status || "open");
    if (!["open", "booked", "helpful", "declined", "no_response", "not_relevant", "closed"].includes(status)) {
      return jsonError(res, 400, "Valid outcome status is required");
    }
    const createdAt = now();
    const outcome: OutreachOutcome = {
      id: randomUUID(),
      campaignId,
      mentorProfileId,
      status: status as OutcomeStatus,
      summary: String(req.body?.summary || ""),
      valueLevel: ["low", "medium", "high"].includes(String(req.body?.valueLevel)) ? String(req.body.valueLevel) as OutreachOutcome["valueLevel"] : "medium",
      createdAt,
      updatedAt: createdAt,
    };
    state.outreachOutcomes.unshift(outcome);
    if (["declined", "no_response", "not_relevant", "closed"].includes(outcome.status)) {
      mentor.stage = "closed";
      mentor.updatedAt = createdAt;
      state.followUpPlans.forEach((followUp) => {
        if (followUp.mentorProfileId === mentor.id && followUp.status === "scheduled") {
          followUp.status = "cancelled";
          followUp.updatedAt = createdAt;
        }
      });
    }
    if (["booked", "helpful"].includes(outcome.status)) {
      mentor.stage = "responded";
      mentor.updatedAt = createdAt;
    }
    recalcCampaign(state, campaignId);
    audit(state, "recorded_outreach_outcome", "outreachOutcome", outcome.id, outcome, { riskLevel: "medium" });
    return { outcome };
  }));

  app.post("/api/resource-sessions", route((req, res, state) => {
    const campaignId = String(req.body?.campaignId || "");
    const campaign = requireCampaign(state, campaignId);
    if (!campaign) return jsonError(res, 404, "Campaign not found");
    const startedAt = now();
    const startSnapshot = resourceSnapshot();
    const session: ResourceUsageSession = {
      id: randomUUID(),
      campaignId,
      userId: DEFAULT_USER_ID,
      status: "active",
      measurementMode: "process",
      measurementNote: "Process-level local measurement using Node CPU time, RSS memory, ledger file size, and observed API payload bytes.",
      startedAt,
      endedAt: null,
      cpuCoreHours: 0,
      ramGbHours: 0,
      storageGbHours: 0,
      bandwidthGb: 0,
      estimatedKwh: 0,
      rawResourceCost: 0,
      finalCost: 0,
      pricingFormula: PRICING_FORMULA,
      startSnapshot,
      endSnapshot: null,
      createdAt: startedAt,
    };
    state.resourceUsageSessions.unshift(session);
    audit(state, "started_resource_session", "resourceUsageSession", session.id, session);
    return { session };
  }));

  app.post("/api/resource-sessions/:id/end", route((req, res, state) => {
    const session = state.resourceUsageSessions.find((item) => item.id === routeId(req));
    if (!session) return jsonError(res, 404, "Resource session not found");
    if (session.status === "ended") return { session };
    const endedAt = now();
    const endSnapshot = resourceSnapshot();
    const measuredCosts = calculateResourceCosts(session.startSnapshot, endSnapshot);
    Object.assign(session, {
      status: "ended",
      endedAt,
      endSnapshot,
      ...measuredCosts,
    });
    const billingRecord: BillingRecord = {
      id: randomUUID(),
      campaignId: session.campaignId,
      resourceUsageSessionId: session.id,
      rawResourceCost: session.rawResourceCost,
      finalCost: session.finalCost,
      currency: "EUR",
      pricingFormula: PRICING_FORMULA,
      generatedAt: endedAt,
    };
    state.billingRecords.unshift(billingRecord);
    audit(state, "ended_resource_session_and_generated_billing_record", "resourceUsageSession", session.id, { session, billingRecord });
    return { session, billingRecord };
  }));

  app.get("/api/billing", route((req, _res, state) => {
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : null;
    const records = campaignId ? state.billingRecords.filter((item) => item.campaignId === campaignId) : state.billingRecords;
    const invoices = campaignId ? state.invoiceRecords.filter((item) => item.campaignId === campaignId) : state.invoiceRecords;
    return {
      records,
      invoices,
      totalRawResourceCost: records.reduce((sum, item) => sum + item.rawResourceCost, 0),
      totalFinalCost: records.reduce((sum, item) => sum + item.finalCost, 0),
      currency: "EUR",
      pricingFormula: PRICING_FORMULA,
      measurementNote: "Resource sessions use process-level local measurements: Node CPU time, RSS memory, ledger file size, and observed API payload bytes.",
    };
  }));

  app.get("/api/campaigns/:id/usage-report", route((req, res, state) => {
    const details = attachCampaignDetails(state, routeId(req));
    if (!details) return jsonError(res, 404, "Campaign not found");
    return buildUsageReport(details);
  }));

  app.get("/api/invoices", route((req, _res, state) => {
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : null;
    const invoices = campaignId ? state.invoiceRecords.filter((item) => item.campaignId === campaignId) : state.invoiceRecords;
    return { invoices };
  }));

  app.get("/api/campaigns/:id/invoices", route((req, res, state) => {
    const campaignId = routeId(req);
    if (!requireCampaign(state, campaignId)) return jsonError(res, 404, "Campaign not found");
    return { invoices: state.invoiceRecords.filter((item) => item.campaignId === campaignId) };
  }));

  app.post("/api/campaigns/:id/invoices", route((req, res, state) => {
    const campaignId = routeId(req);
    if (!requireCampaign(state, campaignId)) return jsonError(res, 404, "Campaign not found");
    const billingRecords = state.billingRecords.filter((item) => item.campaignId === campaignId);
    if (!billingRecords.length) return jsonError(res, 409, "Generate at least one billing record before creating an invoice report");
    const result = createInvoiceRecord(state, campaignId);
    if (!result) return jsonError(res, 404, "Campaign not found");
    return result;
  }));

  app.get("/api/audit", route((req, _res, state) => {
    const entityId = typeof req.query.entityId === "string" ? req.query.entityId : null;
    return {
      auditEvents: entityId ? state.auditEvents.filter((item) => item.entityId === entityId) : state.auditEvents,
    };
  }));
}
