export type CampaignStatus = "active" | "paused" | "completed" | "archived";
export type MentorStage = "new" | "matched" | "drafted" | "approved" | "contacted" | "responded" | "follow_up" | "closed";
export type DraftStatus = "draft" | "approved" | "rejected" | "sent";

export type OutreachProject = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type Campaign = {
  id: string;
  projectId: string;
  title: string;
  goal: string;
  targetMentorType: string;
  status: CampaignStatus;
  source: string;
  criteriaJson: {
    tone?: string;
    followUpAfterDays?: number;
    requiredApproval?: boolean;
  };
  totalMentors: number;
  messagesDrafted: number;
  messagesApproved: number;
  messagesSent: number;
  responsesReceived: number;
  followUpsDue: number;
};

export type MentorSource = {
  id: string;
  campaignId: string;
  name: string;
  sourceType: string;
  searchQuery: string;
  status: "planned" | "searched" | "imported" | "skipped";
  resultsFound: number;
  importedCount: number;
  notes: string;
  searchedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MentorProfile = {
  id: string;
  campaignId: string;
  name: string;
  headline: string;
  bio: string;
  skills: string[];
  source: string;
  sourceRecordId: string | null;
  profileUrl: string | null;
  stage: MentorStage;
  notes: string;
};

export type MatchAssessment = {
  id: string;
  mentorProfileId: string;
  campaignId: string;
  score: number;
  reasonsJson: string[];
  risksJson: string[];
  confidence: number;
};

export type MessageDraft = {
  id: string;
  campaignId: string;
  mentorProfileId: string;
  subject: string;
  body: string;
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;
};

export type MessageQualityReview = {
  id: string;
  messageDraftId: string;
  campaignId: string;
  mentorProfileId: string;
  status: "pass" | "warning" | "blocked";
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

export type MessageApproval = {
  id: string;
  messageDraftId: string;
  decision: "approved" | "rejected";
  decisionReason: string;
  approvedSubjectSnapshot: string;
  approvedBodySnapshot: string;
  decidedAt: string;
  createdAt: string;
};

export type MessageSendAttempt = {
  id: string;
  messageDraftId: string;
  mentorProfileId: string;
  campaignId: string;
  status: "queued" | "confirmed_sent" | "failed";
  channel: string;
  startedAt: string;
  finishedAt: string;
  errorMessage: string | null;
  deliveryEvidence: string;
  retryCount: number;
  createdAt: string;
};

export type FollowUpPlan = {
  id: string;
  campaignId: string;
  mentorProfileId: string;
  messageDraftId: string | null;
  dueAt: string;
  status: "scheduled" | "completed" | "cancelled";
  suggestedMessage: string;
  createdAt: string;
  updatedAt: string;
};

export type MentorResponse = {
  id: string;
  campaignId: string;
  mentorProfileId: string;
  messageDraftId: string | null;
  classification: "interested" | "not_interested" | "more_info" | "unavailable" | "unknown";
  body: string;
  nextAction: string;
  createdAt: string;
};

export type BillingRecord = {
  id: string;
  campaignId: string;
  resourceUsageSessionId: string;
  rawResourceCost: number;
  finalCost: number;
  currency: "EUR";
  pricingFormula: string;
  generatedAt: string;
};

export type InvoiceRecord = {
  id: string;
  campaignId: string;
  invoiceNumber: string;
  status: "generated" | "void";
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

export type ResourceUsageSession = {
  id: string;
  campaignId: string;
  status: "active" | "ended";
  measurementMode: "process";
  measurementNote: string;
  cpuCoreHours: number;
  ramGbHours: number;
  storageGbHours: number;
  bandwidthGb: number;
  estimatedKwh: number;
  rawResourceCost: number;
  finalCost: number;
};

export type OutreachOutcome = {
  id: string;
  campaignId: string;
  mentorProfileId: string;
  status: "open" | "booked" | "helpful" | "declined" | "no_response" | "not_relevant" | "closed";
  summary: string;
  valueLevel: "low" | "medium" | "high";
  createdAt: string;
  updatedAt: string;
};

export type CampaignResults = {
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
  outcomeBreakdown: Record<OutreachOutcome["status"], number>;
  followUpBreakdown: Record<FollowUpPlan["status"], number>;
};

export type NextActionRecommendation = {
  id: string;
  campaignId: string;
  sourceRecordId?: string | null;
  mentorProfileId: string | null;
  messageDraftId: string | null;
  followUpId: string | null;
  responseId: string | null;
  priority: "high" | "medium" | "low";
  type:
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
  title: string;
  description: string;
  recommendedAction: string;
  dueAt: string | null;
  createdFrom: "derived_from_ledger";
};

export type CampaignReadinessItem = {
  id: string;
  label: string;
  status: "complete" | "attention" | "blocked";
  completed: number;
  total: number;
  detail: string;
  nextActionType: NextActionRecommendation["type"] | null;
};

export type CampaignReadiness = {
  score: number;
  status: "ready" | "needs_work" | "blocked";
  completedItems: number;
  totalItems: number;
  blockers: number;
  attentionItems: number;
  items: CampaignReadinessItem[];
};

export type HaiCampaignSnapshot = {
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

export type HaiIntegrationStatus = {
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

export type AuditEvent = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  riskLevel: "low" | "medium" | "high";
  createdAt: string;
};

export type RelationshipTimelineEntry = {
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

export type MentorRelationshipTimeline = {
  mentorProfileId: string;
  generatedAt: string;
  entries: RelationshipTimelineEntry[];
};

export type LedgerSummary = {
  activeCampaigns: Campaign[];
  totals: {
    mentors: number;
    strongMatches: number;
    drafts: number;
    approvals: number;
    sent: number;
    responses: number;
    followUpsDue: number;
    finalCost: number;
    nextActions: number;
  };
  nextActions: NextActionRecommendation[];
  recentActivity: AuditEvent[];
};

export type RuntimeStatus = {
  mode: "production" | "development";
  version: string;
  host: string;
  port: number;
  localUrl: string;
  tunnel: {
    active: boolean;
    publicUrl: string | null;
    inspectorUrl: string | null;
    target: string | null;
  };
  auth: {
    basicAuthConfigured: boolean;
  };
  warnings: Array<"ngrok_public_without_basic_auth" | string>;
};

export type HealthStatus = {
  ok: boolean;
  service: "maro-ledger";
  schemaVersion: number;
  persistence: "local-json" | "encrypted-json";
  storage: {
    persistence: "local-json" | "encrypted-json";
    encrypted: boolean;
  };
  pricingFormula: string;
  timestamp: string;
};

export type WorkspaceSummary = {
  schemaVersion: number;
  projects: number;
  campaigns: number;
  sourceRecords: number;
  mentors: number;
  identities: number;
  assessments: number;
  drafts: number;
  qualityReviews: number;
  approvals: number;
  sendAttempts: number;
  responses: number;
  followUps: number;
  outcomes: number;
  resourceSessions: number;
  billingRecords: number;
  invoiceRecords: number;
  auditEvents: number;
};

export type WorkspaceBackup = {
  kind: "maro-workspace-backup";
  schemaVersion: 1;
  exportedAt: string;
  summary: WorkspaceSummary;
  ledger: unknown;
};

export type CampaignDetails = {
  campaign: Campaign;
  sourceRecords: MentorSource[];
  mentors: MentorProfile[];
  assessments: MatchAssessment[];
  messages: MessageDraft[];
  qualityReviews: MessageQualityReview[];
  approvals: MessageApproval[];
  sendAttempts: MessageSendAttempt[];
  responses: MentorResponse[];
  followUps: FollowUpPlan[];
  resourceSessions: ResourceUsageSession[];
  billingRecords: BillingRecord[];
  invoiceRecords: InvoiceRecord[];
  outcomes: OutreachOutcome[];
  results: CampaignResults;
  readiness: CampaignReadiness;
  nextActions: NextActionRecommendation[];
  auditEvents: AuditEvent[];
};

export type UsageReport = {
  reportId: string;
  generatedAt: string;
  totals: {
    mentors: number;
    messagesDrafted: number;
    messagesApproved: number;
    messagesSent: number;
    responsesReceived: number;
    followUpsDue: number;
    outcomesRecorded: number;
    rawResourceCost: number;
    finalCost: number;
    currency: "EUR";
  };
  pricingFormula: string;
  measurementNote: string;
  billingRecords: BillingRecord[];
  invoiceRecords: InvoiceRecord[];
};

export type MentorImportResult = {
  preview: boolean;
  totalRows: number;
  importedCount: number;
  skipped: Array<{ row: number; reason: string; name: string }>;
  imported: MentorProfile[];
};

export type MentorCsvColumnMap = Partial<Record<"name" | "company" | "headline" | "bio" | "skills" | "profileUrl" | "notes" | "source" | "priority" | "stage", string>>;

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Request failed with ${response.status}`);
  }
  return data;
}

export const ledgerApi = {
  health: () => request<HealthStatus>("/api/health"),
  runtimeStatus: () => request<RuntimeStatus>("/api/runtime/status"),
  workspaceBackup: () => request<WorkspaceBackup>("/api/workspace/backup"),
  previewWorkspaceRestore: (backupJson: string) =>
    request<{ valid: true; summary: WorkspaceSummary }>("/api/workspace/restore/preview", {
      method: "POST",
      body: JSON.stringify({ backupJson }),
    }),
  restoreWorkspace: (backupJson: string) =>
    request<{ restored: true; summary: WorkspaceSummary }>("/api/workspace/restore", {
      method: "POST",
      body: JSON.stringify({ backupJson, confirm: true }),
    }),
  resetWorkspace: (scope: "queue" | "mentors" | "workspace") =>
    request<{ reset: true; scope: string; summary: WorkspaceSummary }>("/api/workspace/reset", {
      method: "POST",
      body: JSON.stringify({ scope, confirm: true }),
    }),
  actions: (campaignId?: string) =>
    request<{ actions: NextActionRecommendation[] }>(campaignId ? `/api/actions?campaignId=${encodeURIComponent(campaignId)}` : "/api/actions"),
  summary: () => request<LedgerSummary>("/api/ledger/summary"),
  haiStatus: () => request<HaiIntegrationStatus>("/api/integrations/hai/status"),
  projects: () => request<{ projects: OutreachProject[] }>("/api/projects"),
  createProject: (payload: { title: string; description?: string }) =>
    request<{ project: OutreachProject }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateProject: (projectId: string, payload: Partial<Pick<OutreachProject, "title" | "description">>) =>
    request<{ project: OutreachProject }>(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  campaigns: () => request<{ campaigns: Campaign[] }>("/api/campaigns"),
  campaign: (id: string) => request<CampaignDetails>(`/api/campaigns/${id}`),
  createCampaign: (payload: {
    projectId?: string;
    title: string;
    goal: string;
    targetMentorType: string;
    source: string;
    criteriaJson?: Campaign["criteriaJson"];
  }) =>
    request<{ campaign: Campaign }>("/api/campaigns", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCampaign: (campaignId: string, payload: Partial<Pick<Campaign, "projectId" | "title" | "goal" | "targetMentorType" | "source" | "status" | "criteriaJson">>) =>
    request<{ campaign: Campaign }>(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  createSourceRecord: (campaignId: string, payload: {
    name: string;
    sourceType: string;
    searchQuery: string;
    status: MentorSource["status"];
    resultsFound: number;
    importedCount: number;
    notes: string;
  }) =>
    request<{ source: MentorSource }>(`/api/campaigns/${campaignId}/sources`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateSourceRecord: (sourceId: string, payload: Partial<Pick<MentorSource, "name" | "sourceType" | "searchQuery" | "status" | "resultsFound" | "importedCount" | "notes" | "searchedAt">>) =>
    request<{ source: MentorSource }>(`/api/sources/${sourceId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  addMentor: (campaignId: string, payload: {
    name: string;
    company: string;
    headline: string;
    bio: string;
    skills: string;
    profileUrl: string;
    sourceRecordId?: string;
    notes: string;
  }) =>
    request<{ mentor: MentorProfile; assessment: MatchAssessment; duplicateCount: number }>(
      `/api/campaigns/${campaignId}/mentors`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),
  updateMentor: (mentorId: string, payload: Partial<{
    name: string;
    headline: string;
    bio: string;
    skills: string;
    profileUrl: string;
    notes: string;
    stage: MentorStage;
  }>) =>
    request<{ mentor: MentorProfile; assessment: MatchAssessment }>(`/api/mentors/${mentorId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  resolveDuplicateMentor: (mentorId: string, payload: { canonicalMentorProfileId?: string; resolutionNote?: string } = {}) =>
    request<{ mentor: MentorProfile; canonicalMentor: MentorProfile; cancelledFollowUps: number }>(`/api/mentors/${mentorId}/resolve-duplicate`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  importMentorCsv: (campaignId: string, csvText: string, preview = false, columnMap?: MentorCsvColumnMap, sourceRecordId?: string) =>
    request<MentorImportResult>(`/api/campaigns/${campaignId}/mentors/import`, {
      method: "POST",
      body: JSON.stringify({ csvText, preview, columnMap, sourceRecordId }),
    }),
  exportMentorCsv: (campaignId: string) =>
    request<{ filename: string; csv: string }>(`/api/campaigns/${campaignId}/mentors/export`),
  exportCampaignHistoryCsv: (campaignId: string) =>
    request<{ filename: string; csv: string }>(`/api/campaigns/${campaignId}/history/export`),
  mentorTimeline: (mentorId: string) =>
    request<{ relationshipTimeline: MentorRelationshipTimeline }>(`/api/mentors/${mentorId}/timeline`),
  createDraft: (campaignId: string, mentorProfileId: string) =>
    request<{ draft: MessageDraft }>(`/api/campaigns/${campaignId}/messages`, {
      method: "POST",
      body: JSON.stringify({ mentorProfileId }),
    }),
  updateDraft: (messageId: string, payload: Pick<MessageDraft, "subject" | "body">) =>
    request<{ draft: MessageDraft }>(`/api/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  approveDraft: (messageId: string, decisionReason: string) =>
    request<{ draft: MessageDraft }>(`/api/messages/${messageId}/approve`, {
      method: "POST",
      body: JSON.stringify({ decisionReason }),
    }),
  rejectDraft: (messageId: string, decisionReason: string) =>
    request<{ draft: MessageDraft }>(`/api/messages/${messageId}/reject`, {
      method: "POST",
      body: JSON.stringify({ decisionReason }),
    }),
  confirmSend: (messageId: string, deliveryEvidence: string) =>
    request<{ draft: MessageDraft }>(`/api/messages/${messageId}/send-attempt`, {
      method: "POST",
      body: JSON.stringify({ channel: "manual", deliveryEvidence }),
    }),
  recordFailedSendAttempt: (messageId: string, errorMessage: string) =>
    request<{ draft: MessageDraft; attempt: MessageSendAttempt }>(`/api/messages/${messageId}/send-attempt`, {
      method: "POST",
      body: JSON.stringify({ channel: "manual", status: "failed", errorMessage }),
    }),
  recordResponse: (payload: {
    campaignId: string;
    mentorProfileId: string;
    messageDraftId: string | null;
    classification: MentorResponse["classification"];
    body: string;
    nextAction: string;
  }) =>
    request<{ response: MentorResponse }>("/api/responses", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  scheduleFollowUp: (payload: {
    campaignId: string;
    mentorProfileId: string;
    messageDraftId: string | null;
    dueAt: string;
    suggestedMessage: string;
  }) =>
    request<{ followUp: FollowUpPlan }>("/api/follow-ups", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateFollowUp: (followUpId: string, payload: Partial<Pick<FollowUpPlan, "dueAt" | "status" | "suggestedMessage">>) =>
    request<{ followUp: FollowUpPlan }>(`/api/follow-ups/${followUpId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  createFollowUpDraft: (followUpId: string, payload: Partial<Pick<MessageDraft, "subject" | "body">> = {}) =>
    request<{ draft: MessageDraft; followUp: FollowUpPlan; qualityReview: MessageQualityReview }>(`/api/follow-ups/${followUpId}/draft`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  completeFollowUp: (followUpId: string) =>
    request<{ followUp: FollowUpPlan }>(`/api/follow-ups/${followUpId}/complete`, {
      method: "POST",
    }),
  cancelFollowUp: (followUpId: string) =>
    request<{ followUp: FollowUpPlan }>(`/api/follow-ups/${followUpId}/cancel`, {
      method: "POST",
    }),
  recordOutcome: (payload: {
    campaignId: string;
    mentorProfileId: string;
    status: OutreachOutcome["status"];
    summary: string;
    valueLevel: OutreachOutcome["valueLevel"];
  }) =>
    request<{ outcome: OutreachOutcome }>("/api/outcomes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  usageReport: (campaignId: string) => request<UsageReport>(`/api/campaigns/${campaignId}/usage-report`),
  generateInvoice: (campaignId: string) =>
    request<{ invoiceRecord: InvoiceRecord; usageReport: UsageReport }>(`/api/campaigns/${campaignId}/invoices`, {
      method: "POST",
    }),
  closeResourceSession: async (campaignId: string) => {
    const created = await request<{ session: { id: string } }>("/api/resource-sessions", {
      method: "POST",
      body: JSON.stringify({ campaignId }),
    });
    return request<{ session: ResourceUsageSession; billingRecord: BillingRecord }>(`/api/resource-sessions/${created.session.id}/end`, {
      method: "POST",
    });
  },
};
