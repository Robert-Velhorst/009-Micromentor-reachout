import type { Express, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";

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
  outreachOutcomes: OutreachOutcome[];
  auditEvents: AuditEvent[];
};

type WorkspaceResetScope = "queue" | "mentors" | "workspace";

const PRICING_FORMULA = "Resource Cost x 2 = Final Price";
const DEFAULT_USER_ID = "local-operator";
const DEFAULT_PROJECT_ID = "project-robert-support-network";
const DEFAULT_CAMPAIGN_ID = "campaign-micromentor-first-wave";
const LEDGER_ARRAY_KEYS = [
  "operators",
  "projects",
  "campaigns",
  "mentorIdentities",
  "mentorProfiles",
  "matchAssessments",
  "messageDrafts",
  "messageApprovals",
  "messageSendAttempts",
  "mentorResponses",
  "followUpPlans",
  "resourceUsageSessions",
  "billingRecords",
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
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function mentorsToCsv(mentors: MentorProfile[], assessments: MatchAssessment[]) {
  const headers = ["name", "company", "headline", "bio", "skills", "source", "profileUrl", "stage", "notes", "score", "reasons"];
  const rows = mentors.map((mentor) => {
    const assessment = assessments.find((item) => item.mentorProfileId === mentor.id);
    const company = typeof mentor.rawProfileJson.company === "string" ? mentor.rawProfileJson.company : "";
    return [
      mentor.name,
      company,
      mentor.headline,
      mentor.bio,
      mentor.skills,
      mentor.source,
      mentor.profileUrl || "",
      mentor.stage,
      mentor.notes,
      assessment?.score ?? "",
      assessment?.reasonsJson.join(" | ") ?? "",
    ];
  });

  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
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
    criteriaJson: {
      tone: "respectful, concise, practical",
      followUpAfterDays: 7,
      requiredApproval: true,
    },
    totalMentors: 0,
    messagesDrafted: 0,
    messagesApproved: 0,
    messagesSent: 0,
    responsesReceived: 0,
    followUpsDue: 0,
    createdAt,
    updatedAt: createdAt,
  };

  return {
    schemaVersion: 1,
    operators: [operator],
    projects: [project],
    campaigns: [campaign],
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
    campaigns: state.campaigns || [],
    mentorIdentities: state.mentorIdentities || [],
    mentorProfiles: state.mentorProfiles || [],
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

  const state = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<LedgerState>;
  return normalizeState(state);
}

function writeState(state: LedgerState) {
  const filePath = dataPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
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
  state.outreachOutcomes = [];

  if (scope === "mentors") {
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

function attachCampaignDetails(state: LedgerState, campaignId: string) {
  recalcCampaign(state, campaignId);
  const campaign = state.campaigns.find((item) => item.id === campaignId);
  if (!campaign) return null;
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
  const outcomes = state.outreachOutcomes.filter((item) => item.campaignId === campaignId);
  const outcomeIds = new Set(outcomes.map((item) => item.id));

  return {
    campaign,
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
    outcomes,
    auditEvents: state.auditEvents.filter(
      (item) =>
        item.entityId === campaignId ||
        mentorIds.has(item.entityId) ||
        messageIds.has(item.entityId) ||
        followUpIds.has(item.entityId) ||
        responseIds.has(item.entityId) ||
        resourceSessionIds.has(item.entityId) ||
        billingRecordIds.has(item.entityId) ||
        outcomeIds.has(item.entityId)
    ),
  };
}

function scoreMentor(campaign: OutreachCampaign, mentor: Pick<MentorProfile, "headline" | "bio" | "skills" | "industries">) {
  const criteria = `${campaign.goal} ${campaign.targetMentorType}`.toLowerCase();
  const profileText = `${mentor.headline} ${mentor.bio} ${mentor.skills.join(" ")} ${mentor.industries.join(" ")}`.toLowerCase();
  const keywords = Array.from(new Set(criteria.split(/[^a-z0-9]+/).filter((word) => word.length > 4)));
  const matches = keywords.filter((word) => profileText.includes(word));
  const score = Math.min(98, Math.max(35, 45 + matches.length * 9));

  return {
    score,
    confidence: Math.min(0.95, 0.45 + matches.length * 0.08),
    reasonsJson: matches.length
      ? matches.slice(0, 5).map((word) => `Profile matches campaign keyword "${word}".`)
      : ["Profile was imported for manual review; not enough structured evidence for a strong automated match."],
    risksJson: score < 60 ? ["Low keyword overlap; review relevance before drafting outreach."] : [],
  };
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

function requireCampaign(state: LedgerState, campaignId: string) {
  return state.campaigns.find((item) => item.id === campaignId);
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
    source: String(body?.source || campaign.source || "manual"),
    sourceProfileId: body?.sourceProfileId ? String(body.sourceProfileId) : null,
    profileUrl: body?.profileUrl ? String(body.profileUrl) : null,
    name,
    headline: String(body?.headline || body?.role || "Mentor"),
    bio: String(body?.bio || body?.goal || ""),
    skills: Array.isArray(body?.skills) ? body.skills.map(String) : String(body?.skills || "").split(",").map((item) => item.trim()).filter(Boolean),
    industries: Array.isArray(body?.industries) ? body.industries.map(String) : [],
    location: String(body?.location || ""),
    availability: String(body?.availability || "Unknown"),
    contactMethod: String(body?.contactMethod || "manual"),
    rawProfileJson: { ...body, company },
    stage: "matched",
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

function createMessageDraftRecord(state: LedgerState, campaign: OutreachCampaign, body: Record<string, unknown>) {
  const mentor = state.mentorProfiles.find((item) => item.id === String(body?.mentorProfileId));
  if (!mentor || mentor.campaignId !== campaign.id) {
    return { error: "Valid mentorProfileId is required" };
  }
  const createdAt = now();
  const assessment = state.matchAssessments.find((item) => item.mentorProfileId === mentor.id);
  const subject = String(body?.subject || `Quick MicroMentor question for ${firstName(mentor.name)}`);
  const messageBody = String(
    body?.body ||
      `Hi ${firstName(mentor.name)},\n\nI found your profile while working on: ${campaign.goal}\n\nYou look relevant because ${assessment?.reasonsJson[0] || "your background appears connected to this campaign"}.\n\nWould you be open to a short practical exchange?\n\nBest,\nRobert`
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

export function registerLedgerRoutes(app: Express) {
  app.get("/api/health", route((_req, _res, state) => ({
    ok: true,
    service: "maro-ledger",
    schemaVersion: state.schemaVersion,
    persistence: "local-json",
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
    const totals = state.campaigns.reduce(
      (acc, campaign) => ({
        mentors: acc.mentors + campaign.totalMentors,
        strongMatches: acc.strongMatches + state.matchAssessments.filter((item) => item.campaignId === campaign.id && item.score >= 70).length,
        drafts: acc.drafts + campaign.messagesDrafted,
        approvals: acc.approvals + campaign.messagesApproved,
        sent: acc.sent + campaign.messagesSent,
        responses: acc.responses + campaign.responsesReceived,
        followUpsDue: acc.followUpsDue + campaign.followUpsDue,
        finalCost: acc.finalCost + state.billingRecords.filter((item) => item.campaignId === campaign.id).reduce((sum, item) => sum + item.finalCost, 0),
      }),
      { mentors: 0, strongMatches: 0, drafts: 0, approvals: 0, sent: 0, responses: 0, followUpsDue: 0, finalCost: 0 }
    );

    return {
      activeCampaigns,
      totals,
      recentActivity: state.auditEvents.slice(0, 8),
    };
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
    const createdAt = now();
    const campaign: OutreachCampaign = {
      id: randomUUID(),
      userId: DEFAULT_USER_ID,
      projectId: String(req.body?.projectId || state.projects[0]?.id || DEFAULT_PROJECT_ID),
      title,
      goal,
      targetMentorType: String(req.body?.targetMentorType || "Relevant mentor or advisor"),
      status: "active",
      source: String(req.body?.source || "manual"),
      criteriaJson: req.body?.criteriaJson && typeof req.body.criteriaJson === "object" ? req.body.criteriaJson : {},
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
    if (typeof req.body?.title === "string" && req.body.title.trim()) campaign.title = req.body.title.trim();
    if (typeof req.body?.goal === "string" && req.body.goal.trim()) campaign.goal = req.body.goal.trim();
    if (typeof req.body?.targetMentorType === "string" && req.body.targetMentorType.trim()) {
      campaign.targetMentorType = req.body.targetMentorType.trim();
    }
    if (typeof req.body?.source === "string") campaign.source = req.body.source;
    if (["active", "paused", "completed", "archived"].includes(String(req.body?.status))) {
      campaign.status = String(req.body.status) as CampaignStatus;
    }
    if (req.body?.criteriaJson && typeof req.body.criteriaJson === "object") {
      campaign.criteriaJson = req.body.criteriaJson as Record<string, unknown>;
    }
    campaign.updatedAt = now();
    recalcCampaign(state, campaign.id);
    audit(state, "updated_campaign", "campaign", campaign.id, campaign, { beforeState: before, riskLevel: "medium" });
    return { campaign };
  }));

  app.get("/api/campaigns/:id", route((req, res, state) => {
    const details = attachCampaignDetails(state, routeId(req));
    return details || jsonError(res, 404, "Campaign not found");
  }));

  app.post("/api/campaigns/:id/mentors", route((req, res, state) => {
    const campaign = requireCampaign(state, routeId(req));
    if (!campaign) return jsonError(res, 404, "Campaign not found");
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

  app.post("/api/campaigns/:id/mentors/import", route((req, res, state) => {
    const campaign = requireCampaign(state, routeId(req));
    if (!campaign) return jsonError(res, 404, "Campaign not found");
    const csvText = String(req.body?.csvText || "");
    const preview = req.body?.preview === true;
    if (!csvText.trim()) return jsonError(res, 400, "CSV text is required");

    const rows = parseCsv(csvText);
    if (rows.length < 2) return jsonError(res, 400, "CSV must include a header row and at least one mentor row");
    const headers = rows[0].map((header) => normalize(header));
    const field = (row: string[], names: string[]) => {
      for (const name of names) {
        const index = headers.indexOf(name);
        if (index >= 0) return row[index] || "";
      }
      return "";
    };

    const imported: MentorProfile[] = [];
    const skipped: Array<{ row: number; reason: string; name: string }> = [];
    const plannedKeys = new Set<string>();

    rows.slice(1).forEach((row, index) => {
      const payload = {
        name: field(row, ["name", "mentor", "full name"]),
        company: field(row, ["company", "organization", "organisation"]),
        headline: field(row, ["headline", "role", "title"]),
        bio: field(row, ["bio", "goal", "context", "description"]),
        skills: field(row, ["skills", "skill"]),
        profileUrl: field(row, ["profileurl", "profile url", "url", "source url"]),
        notes: field(row, ["notes", "note"]),
        source: field(row, ["source"]) || campaign.source,
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
      filename: `${campaign.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "maro"}-mentors.csv`,
      csv: mentorsToCsv(mentors, assessments),
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
    };
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
    if (typeof req.body?.profileUrl === "string") mentor.profileUrl = req.body.profileUrl || null;
    if (typeof req.body?.source === "string") mentor.source = req.body.source;
    if (typeof req.body?.location === "string") mentor.location = req.body.location;
    if (typeof req.body?.availability === "string") mentor.availability = req.body.availability;
    if (typeof req.body?.contactMethod === "string") mentor.contactMethod = req.body.contactMethod;
    if (typeof req.body?.notes === "string") mentor.notes = req.body.notes;
    if (Array.isArray(req.body?.skills)) {
      mentor.skills = req.body.skills.map(String);
    } else if (typeof req.body?.skills === "string") {
      mentor.skills = req.body.skills.split(",").map((item: string) => item.trim()).filter(Boolean);
    }
    if (Array.isArray(req.body?.industries)) {
      mentor.industries = req.body.industries.map(String);
    } else if (typeof req.body?.industries === "string") {
      mentor.industries = req.body.industries.split(",").map((item: string) => item.trim()).filter(Boolean);
    }
    if (["new", "matched", "drafted", "approved", "contacted", "responded", "follow_up", "closed"].includes(String(req.body?.stage))) {
      mentor.stage = String(req.body.stage) as MentorStage;
    }
    mentor.updatedAt = now();
    const assessmentInput = scoreMentor(campaign, mentor);
    const assessment = state.matchAssessments.find((item) => item.mentorProfileId === mentor.id);
    if (assessment) {
      assessment.score = assessmentInput.score;
      assessment.confidence = assessmentInput.confidence;
      assessment.reasonsJson = assessmentInput.reasonsJson;
      assessment.risksJson = assessmentInput.risksJson;
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

  app.post("/api/campaigns/:id/messages", route((req, res, state) => {
    const campaign = requireCampaign(state, routeId(req));
    if (!campaign) return jsonError(res, 404, "Campaign not found");
    const result = createMessageDraftRecord(state, campaign, req.body || {});
    return "error" in result ? jsonError(res, 400, String(result.error)) : result;
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
    return "error" in result ? jsonError(res, 400, String(result.error)) : result;
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
    const createdAt = now();
    const evidence = String(req.body?.deliveryEvidence || "").trim();
    if (!evidence) return jsonError(res, 400, "Manual delivery evidence is required");
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
      retryCount: 0,
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
      dueAt: addDays(new Date(createdAt), Number(req.body?.followUpAfterDays || 7)),
      status: "scheduled",
      suggestedMessage: `Hi ${mentor ? firstName(mentor.name) : "there"},\n\nI wanted to follow up on my earlier MicroMentor note in case it got buried.\n\nWould a short exchange still be useful?`,
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
    const response: MentorResponse = {
      id: randomUUID(),
      campaignId,
      mentorProfileId,
      messageDraftId: req.body?.messageDraftId ? String(req.body.messageDraftId) : null,
      classification: (req.body?.classification || "unknown") as ResponseClassification,
      body: String(req.body?.body || ""),
      nextAction: String(req.body?.nextAction || "Review response and decide next action"),
      createdAt: now(),
    };
    state.mentorResponses.unshift(response);
    mentor.stage = "responded";
    mentor.updatedAt = response.createdAt;
    for (const followUp of state.followUpPlans) {
      if (followUp.mentorProfileId === mentor.id && followUp.status === "scheduled") {
        followUp.status = "completed";
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
    if (!requireCampaign(state, campaignId)) return jsonError(res, 404, "Campaign not found");
    if (!state.mentorProfiles.some((item) => item.id === mentorProfileId && item.campaignId === campaignId)) {
      return jsonError(res, 400, "Valid mentorProfileId is required");
    }
    const createdAt = now();
    const followUp: FollowUpPlan = {
      id: randomUUID(),
      campaignId,
      mentorProfileId,
      messageDraftId: req.body?.messageDraftId ? String(req.body.messageDraftId) : null,
      dueAt: req.body?.dueAt ? new Date(String(req.body.dueAt)).toISOString() : addDays(new Date(), 7),
      status: "scheduled",
      suggestedMessage: String(req.body?.suggestedMessage || "Short respectful follow-up."),
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
    return {
      records,
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
    const totalRawResourceCost = details.billingRecords.reduce((sum, item) => sum + item.rawResourceCost, 0);
    const totalFinalCost = details.billingRecords.reduce((sum, item) => sum + item.finalCost, 0);
    return {
      reportId: `usage-${details.campaign.id}-${Date.now()}`,
      generatedAt: now(),
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
        currency: "EUR",
      },
      pricingFormula: PRICING_FORMULA,
      measurementNote: "This report uses stored process-level local measurements. It is not an external charge.",
      billingRecords: details.billingRecords,
    };
  }));

  app.get("/api/audit", route((req, _res, state) => {
    const entityId = typeof req.query.entityId === "string" ? req.query.entityId : null;
    return {
      auditEvents: entityId ? state.auditEvents.filter((item) => item.entityId === entityId) : state.auditEvents,
    };
  }));
}
