export type CampaignStatus = "active" | "paused" | "completed" | "archived";
export type MentorStage = "new" | "matched" | "drafted" | "approved" | "contacted" | "responded" | "follow_up" | "closed";
export type DraftStatus = "draft" | "approved" | "rejected" | "sent";

export type Campaign = {
  id: string;
  title: string;
  goal: string;
  targetMentorType: string;
  status: CampaignStatus;
  source: string;
  totalMentors: number;
  messagesDrafted: number;
  messagesApproved: number;
  messagesSent: number;
  responsesReceived: number;
  followUpsDue: number;
};

export type MentorProfile = {
  id: string;
  campaignId: string;
  name: string;
  headline: string;
  bio: string;
  skills: string[];
  source: string;
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
  rawResourceCost: number;
  finalCost: number;
  currency: "EUR";
  pricingFormula: string;
  generatedAt: string;
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

export type AuditEvent = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  riskLevel: "low" | "medium" | "high";
  createdAt: string;
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
  };
  recentActivity: AuditEvent[];
};

export type RuntimeStatus = {
  mode: "production" | "development";
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

export type CampaignDetails = {
  campaign: Campaign;
  mentors: MentorProfile[];
  assessments: MatchAssessment[];
  messages: MessageDraft[];
  approvals: MessageApproval[];
  sendAttempts: MessageSendAttempt[];
  responses: MentorResponse[];
  followUps: FollowUpPlan[];
  resourceSessions: ResourceUsageSession[];
  billingRecords: BillingRecord[];
  outcomes: OutreachOutcome[];
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
};

export type MentorImportResult = {
  preview: boolean;
  totalRows: number;
  importedCount: number;
  skipped: Array<{ row: number; reason: string; name: string }>;
  imported: MentorProfile[];
};

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
  runtimeStatus: () => request<RuntimeStatus>("/api/runtime/status"),
  summary: () => request<LedgerSummary>("/api/ledger/summary"),
  campaigns: () => request<{ campaigns: Campaign[] }>("/api/campaigns"),
  campaign: (id: string) => request<CampaignDetails>(`/api/campaigns/${id}`),
  createCampaign: (payload: {
    title: string;
    goal: string;
    targetMentorType: string;
    source: string;
  }) =>
    request<{ campaign: Campaign }>("/api/campaigns", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCampaign: (campaignId: string, payload: Partial<Pick<Campaign, "title" | "goal" | "targetMentorType" | "source" | "status">>) =>
    request<{ campaign: Campaign }>(`/api/campaigns/${campaignId}`, {
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
  importMentorCsv: (campaignId: string, csvText: string, preview = false) =>
    request<MentorImportResult>(`/api/campaigns/${campaignId}/mentors/import`, {
      method: "POST",
      body: JSON.stringify({ csvText, preview }),
    }),
  exportMentorCsv: (campaignId: string) =>
    request<{ filename: string; csv: string }>(`/api/campaigns/${campaignId}/mentors/export`),
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
