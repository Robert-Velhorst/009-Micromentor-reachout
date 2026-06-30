import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  ClipboardCheck,
  Copy,
  Euro,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Gauge,
  Globe2,
  Lock,
  MailPlus,
  MessageSquareReply,
  Plus,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  type Campaign,
  type CampaignDetails,
  type HealthStatus,
  type LedgerSummary,
  type MessageDraft,
  type MentorSource,
  type MentorCsvColumnMap,
  type MentorImportResult,
  type MentorProfile,
  type MentorResponse,
  type NextActionRecommendation,
  type OutreachOutcome,
  type OutreachProject,
  type RuntimeStatus,
  type UsageReport,
  type WorkspaceSummary,
  ledgerApi,
} from "@/lib/ledgerApi";

type CampaignForm = {
  projectId: string;
  title: string;
  goal: string;
  targetMentorType: string;
  source: string;
  tone: string;
  followUpAfterDays: string;
};

type CampaignSettingsForm = CampaignForm & {
  status: Campaign["status"];
};

type ProjectForm = {
  title: string;
  description: string;
};

type MentorForm = {
  name: string;
  company: string;
  headline: string;
  bio: string;
  skills: string;
  profileUrl: string;
  notes: string;
};

type SourceForm = {
  name: string;
  sourceType: string;
  searchQuery: string;
  status: MentorSource["status"];
  resultsFound: string;
  importedCount: string;
  notes: string;
};

type CsvColumnKey = keyof Required<MentorCsvColumnMap>;
type LedgerTab = "ledger" | "mentors" | "review" | "responses" | "billing" | "audit";
type ResultFilter = "all" | "awaiting_outcome" | "follow_up_due" | "booked" | "declined" | "no_response" | "open";

const csvColumnFields: Array<{ key: CsvColumnKey; label: string; required?: boolean }> = [
  { key: "name", label: "Name", required: true },
  { key: "company", label: "Company" },
  { key: "headline", label: "Headline / role" },
  { key: "bio", label: "Bio / goal" },
  { key: "skills", label: "Skills" },
  { key: "profileUrl", label: "URL / profile" },
  { key: "notes", label: "Notes" },
  { key: "source", label: "Source" },
  { key: "priority", label: "Priority" },
  { key: "stage", label: "Stage" },
];

const csvColumnAliases: Record<CsvColumnKey, string[]> = {
  name: ["name", "mentor", "full name"],
  company: ["company", "organization", "organisation", "org"],
  headline: ["headline", "role", "title"],
  bio: ["bio", "goal", "context", "description"],
  skills: ["skills", "skill"],
  profileUrl: ["profileurl", "profile url", "url", "source url", "profile"],
  notes: ["notes", "note"],
  source: ["source"],
  priority: ["priority"],
  stage: ["stage", "status", "outcome"],
};

const emptyCsvColumnMap = csvColumnFields.reduce(
  (result, field) => ({ ...result, [field.key]: "" }),
  {} as Record<CsvColumnKey, string>
);

const defaultCampaignForm: CampaignForm = {
  projectId: "",
  title: "",
  goal: "",
  targetMentorType: "Startup, operations, product, growth, or automation mentor",
  source: "MicroMentor/manual",
  tone: "respectful, concise, practical",
  followUpAfterDays: "7",
};

const defaultSourceForm: SourceForm = {
  name: "MicroMentor manual search",
  sourceType: "MicroMentor",
  searchQuery: "",
  status: "searched",
  resultsFound: "0",
  importedCount: "0",
  notes: "",
};

const defaultCampaignSettingsForm: CampaignSettingsForm = {
  ...defaultCampaignForm,
  status: "active",
};

const defaultProjectForm: ProjectForm = {
  title: "",
  description: "",
};

const defaultMentorForm: MentorForm = {
  name: "",
  company: "",
  headline: "",
  bio: "",
  skills: "",
  profileUrl: "",
  notes: "",
};

const sampleCsv = `name,company,headline,bio,skills,profileUrl,notes
Ada Lovelace Labs,Analytical Engine Co,Automation advisor,"Helps founders design practical automation workflows","automation, operations",https://example.com/ada,Strong operations angle`;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value || 0);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const stageLabel: Record<string, string> = {
  new: "New",
  matched: "Matched",
  drafted: "Drafted",
  approved: "Approved",
  contacted: "Contacted",
  responded: "Responded",
  follow_up: "Follow-up",
  closed: "Closed",
};

const actionPriorityTone: Record<NextActionRecommendation["priority"], string> = {
  high: "border-red-200 bg-red-50 text-red-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-slate-200 bg-slate-50 text-slate-700",
};

const actionTabMap: Record<NextActionRecommendation["type"], LedgerTab> = {
  add_mentors: "mentors",
  draft_message: "mentors",
  review_fit: "mentors",
  review_duplicate_profile: "mentors",
  record_source_search: "ledger",
  fix_blocked_draft: "review",
  review_draft: "review",
  confirm_manual_send: "review",
  follow_up_due: "responses",
  record_response_outcome: "responses",
  generate_cost_record: "billing",
  generate_invoice_record: "billing",
};

const actionTabLabel: Record<LedgerTab, string> = {
  ledger: "Ledger",
  mentors: "Mentors",
  review: "Review",
  responses: "Responses",
  billing: "Billing",
  audit: "Audit",
};

const resultFilters: Array<{ value: ResultFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "awaiting_outcome", label: "Awaiting outcome" },
  { value: "follow_up_due", label: "Follow-up due" },
  { value: "booked", label: "Booked" },
  { value: "declined", label: "Declined" },
  { value: "no_response", label: "No response" },
  { value: "open", label: "Open" },
];

function latestCampaign(campaigns: Campaign[]) {
  return campaigns.find((campaign) => campaign.status === "active") || campaigns[0] || null;
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    map.set(key, [...(map.get(key) || []), item]);
  }
  return map;
}

function latestByCreatedAt<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] || null;
}

function parseCsvHeaderCells(text: string) {
  const cells: string[] = [];
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
      cells.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      break;
    } else {
      cell += char;
    }
  }

  cells.push(cell.trim());
  return cells.filter(Boolean);
}

function normalizeCsvHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function inferCsvColumnMap(headers: string[], current: Record<CsvColumnKey, string>) {
  const normalizedHeaders = new Map(headers.map((header) => [normalizeCsvHeader(header), header]));
  return csvColumnFields.reduce((next, field) => {
    const currentHeader = current[field.key];
    if (currentHeader && normalizedHeaders.has(normalizeCsvHeader(currentHeader))) {
      next[field.key] = currentHeader;
      return next;
    }
    const matchedAlias = csvColumnAliases[field.key].find((alias) => normalizedHeaders.has(alias));
    next[field.key] = matchedAlias ? normalizedHeaders.get(matchedAlias) || "" : "";
    return next;
  }, { ...emptyCsvColumnMap });
}

function compactColumnMap(columnMap: Record<CsvColumnKey, string>): MentorCsvColumnMap {
  return csvColumnFields.reduce((result, field) => {
    const value = columnMap[field.key].trim();
    if (value) result[field.key] = value;
    return result;
  }, {} as MentorCsvColumnMap);
}

function campaignFollowUpDays(campaign: Campaign | null) {
  const value = Number(campaign?.criteriaJson?.followUpAfterDays);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 7;
}

function campaignTone(campaign: Campaign | null) {
  return campaign?.criteriaJson?.tone || "respectful, concise, practical";
}

function downloadText(filename: string, text: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [projects, setProjects] = useState<OutreachProject[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState("");
  const [details, setDetails] = useState<CampaignDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [projectForm, setProjectForm] = useState<ProjectForm>(defaultProjectForm);
  const [projectEditForm, setProjectEditForm] = useState<ProjectForm>(defaultProjectForm);
  const [campaignForm, setCampaignForm] = useState<CampaignForm>(defaultCampaignForm);
  const [campaignSettingsForm, setCampaignSettingsForm] = useState<CampaignSettingsForm>(defaultCampaignSettingsForm);
  const [sourceForm, setSourceForm] = useState<SourceForm>(defaultSourceForm);
  const [mentorForm, setMentorForm] = useState<MentorForm>(defaultMentorForm);
  const [sendEvidence, setSendEvidence] = useState<Record<string, string>>({});
  const [sendFailureNotes, setSendFailureNotes] = useState<Record<string, string>>({});
  const [responseText, setResponseText] = useState<Record<string, string>>({});
  const [responseClass, setResponseClass] = useState<Record<string, MentorResponse["classification"]>>({});
  const [draftEdits, setDraftEdits] = useState<Record<string, Pick<MessageDraft, "subject" | "body">>>({});
  const [mentorEdits, setMentorEdits] = useState<Record<string, { notes: string; stage: MentorProfile["stage"] }>>({});
  const [outcomeText, setOutcomeText] = useState<Record<string, string>>({});
  const [outcomeStatus, setOutcomeStatus] = useState<Record<string, OutreachOutcome["status"]>>({});
  const [usageReport, setUsageReport] = useState<UsageReport | null>(null);
  const [csvText, setCsvText] = useState(sampleCsv);
  const [csvColumnMap, setCsvColumnMap] = useState<Record<CsvColumnKey, string>>(emptyCsvColumnMap);
  const [csvSourceRecordId, setCsvSourceRecordId] = useState("");
  const [csvFileStatus, setCsvFileStatus] = useState("");
  const [csvImportResult, setCsvImportResult] = useState<MentorImportResult | null>(null);
  const [selectedMentorId, setSelectedMentorId] = useState("");
  const [privacyMode, setPrivacyMode] = useState(true);
  const [revealedSensitive, setRevealedSensitive] = useState<Set<string>>(() => new Set());
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [runtimeCopyStatus, setRuntimeCopyStatus] = useState("");
  const [handoffStatus, setHandoffStatus] = useState<Record<string, string>>({});
  const [workspaceBackupText, setWorkspaceBackupText] = useState("");
  const [workspacePreview, setWorkspacePreview] = useState<WorkspaceSummary | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState("");
  const [activeTab, setActiveTab] = useState<LedgerTab>("ledger");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");

  const loadLedger = async (campaignId?: string) => {
    setLoading(true);
    setError("");
    try {
      const [nextSummary, campaignResult, projectResult, nextHealthStatus, nextRuntimeStatus] = await Promise.all([
        ledgerApi.summary(),
        ledgerApi.campaigns(),
        ledgerApi.projects(),
        ledgerApi.health().catch(() => null),
        ledgerApi.runtimeStatus().catch(() => null),
      ]);
      const nextCampaigns = campaignResult.campaigns;
      const selectedId = campaignId !== undefined ? campaignId || latestCampaign(nextCampaigns)?.id || "" : activeCampaignId || latestCampaign(nextCampaigns)?.id || "";
      const nextDetails = selectedId ? await ledgerApi.campaign(selectedId) : null;
      setSummary(nextSummary);
      setProjects(projectResult.projects);
      setCampaigns(nextCampaigns);
      setActiveCampaignId(selectedId);
      setDetails(nextDetails);
      setHealthStatus(nextHealthStatus);
      setRuntimeStatus(nextRuntimeStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load MARO ledger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLedger();
    // Load once on mount; subsequent refreshes are explicit after mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const csvHeaders = useMemo(() => parseCsvHeaderCells(csvText), [csvText]);
  const csvHeaderKey = csvHeaders.join("\u001f");

  useEffect(() => {
    setCsvColumnMap((current) => inferCsvColumnMap(csvHeaders, current));
  }, [csvHeaderKey]);
  useEffect(() => {
    if (csvSourceRecordId && !details?.sourceRecords.some((source) => source.id === csvSourceRecordId)) {
      setCsvSourceRecordId("");
    }
  }, [csvSourceRecordId, details?.sourceRecords]);

  const campaign = details?.campaign || null;
  const campaignProject = useMemo(
    () => projects.find((project) => project.id === campaign?.projectId) || projects[0] || null,
    [campaign?.projectId, projects]
  );
  useEffect(() => {
    setProjectEditForm({
      title: campaignProject?.title || "",
      description: campaignProject?.description || "",
    });
  }, [campaignProject?.description, campaignProject?.id, campaignProject?.title]);
  useEffect(() => {
    setCampaignSettingsForm({
      projectId: campaign?.projectId || projects[0]?.id || "",
      title: campaign?.title || "",
      goal: campaign?.goal || "",
      targetMentorType: campaign?.targetMentorType || defaultCampaignForm.targetMentorType,
      source: campaign?.source || defaultCampaignForm.source,
      tone: campaign ? campaignTone(campaign) : defaultCampaignForm.tone,
      followUpAfterDays: campaign ? String(campaignFollowUpDays(campaign)) : defaultCampaignForm.followUpAfterDays,
      status: campaign?.status || "active",
    });
  }, [
    campaign?.criteriaJson?.followUpAfterDays,
    campaign?.criteriaJson?.tone,
    campaign?.goal,
    campaign?.id,
    campaign?.projectId,
    campaign?.source,
    campaign?.status,
    campaign?.targetMentorType,
    campaign?.title,
    projects,
  ]);
  const projectContextChanged =
    Boolean(campaignProject) &&
    (projectEditForm.title.trim() !== (campaignProject?.title || "") ||
      projectEditForm.description.trim() !== (campaignProject?.description || ""));
  const normalizedCampaignFollowUpDays = String(Number(campaignSettingsForm.followUpAfterDays) || 7);
  const campaignSettingsChanged = campaign
    ? campaignSettingsForm.projectId !== campaign.projectId ||
      campaignSettingsForm.status !== campaign.status ||
      campaignSettingsForm.title.trim() !== campaign.title ||
      campaignSettingsForm.goal.trim() !== campaign.goal ||
      campaignSettingsForm.targetMentorType.trim() !== campaign.targetMentorType ||
      campaignSettingsForm.source.trim() !== campaign.source ||
      campaignSettingsForm.tone.trim() !== campaignTone(campaign) ||
      normalizedCampaignFollowUpDays !== String(campaignFollowUpDays(campaign))
    : false;
  const assessmentsByMentor = useMemo(
    () => new Map((details?.assessments || []).map((assessment) => [assessment.mentorProfileId, assessment])),
    [details?.assessments]
  );
  const messagesByMentor = useMemo(
    () => groupBy(details?.messages || [], (message) => message.mentorProfileId),
    [details?.messages]
  );
  const approvalsByMessage = useMemo(
    () => groupBy(details?.approvals || [], (approval) => approval.messageDraftId),
    [details?.approvals]
  );
  const qualityByMessage = useMemo(
    () => new Map((details?.qualityReviews || []).map((review) => [review.messageDraftId, review])),
    [details?.qualityReviews]
  );
  const sendAttemptsByMentor = useMemo(
    () => groupBy(details?.sendAttempts || [], (attempt) => attempt.mentorProfileId),
    [details?.sendAttempts]
  );
  const responsesByMentor = useMemo(
    () => groupBy(details?.responses || [], (response) => response.mentorProfileId),
    [details?.responses]
  );
  const followUpsByMentor = useMemo(
    () => groupBy(details?.followUps || [], (followUp) => followUp.mentorProfileId),
    [details?.followUps]
  );
  const outcomesByMentor = useMemo(
    () => groupBy(details?.outcomes || [], (outcome) => outcome.mentorProfileId),
    [details?.outcomes]
  );
  const filteredMentors = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const mentors = details?.mentors || [];
    if (!needle) return mentors;
    return mentors.filter((mentor) =>
      `${mentor.name} ${mentor.headline} ${mentor.bio} ${mentor.skills.join(" ")}`.toLowerCase().includes(needle)
    );
  }, [details?.mentors, query]);
  const selectedMentor = useMemo(() => {
    const mentors = details?.mentors || [];
    return mentors.find((mentor) => mentor.id === selectedMentorId) || filteredMentors[0] || mentors[0] || null;
  }, [details?.mentors, filteredMentors, selectedMentorId]);
  const pendingReview = (details?.messages || []).filter((message) => message.status === "draft");
  const approvedMessages = (details?.messages || []).filter((message) => message.status === "approved");
  const sentMessages = (details?.messages || []).filter((message) => message.status === "sent");
  const nextActions = details?.nextActions || summary?.nextActions || [];
  const progress = campaign?.messagesDrafted ? (campaign.messagesSent / campaign.messagesDrafted) * 100 : 0;

  const mutate = async (action: () => Promise<unknown>) => {
    setError("");
    try {
      await action();
      await loadLedger(activeCampaignId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  const createCampaign = async () => {
    setError("");
    try {
      const result = await ledgerApi.createCampaign({
        projectId: campaignForm.projectId || campaignProject?.id || projects[0]?.id,
        title: campaignForm.title,
        goal: campaignForm.goal,
        targetMentorType: campaignForm.targetMentorType,
        source: campaignForm.source,
        criteriaJson: {
          tone: campaignForm.tone,
          followUpAfterDays: Number(campaignForm.followUpAfterDays) || 7,
          requiredApproval: true,
        },
      });
      setCampaignForm(defaultCampaignForm);
      setActiveCampaignId(result.campaign.id);
      await loadLedger(result.campaign.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create campaign");
    }
  };

  const saveCampaignSettings = () =>
    mutate(async () => {
      if (!campaign) throw new Error("Select a campaign first");
      await ledgerApi.updateCampaign(campaign.id, {
        projectId: campaignSettingsForm.projectId,
        title: campaignSettingsForm.title.trim(),
        goal: campaignSettingsForm.goal.trim(),
        targetMentorType: campaignSettingsForm.targetMentorType.trim(),
        source: campaignSettingsForm.source.trim(),
        status: campaignSettingsForm.status,
        criteriaJson: {
          tone: campaignSettingsForm.tone.trim(),
          followUpAfterDays: Number(campaignSettingsForm.followUpAfterDays) || 7,
          requiredApproval: true,
        },
      });
    });

  const recordSourceSearch = () =>
    mutate(async () => {
      if (!activeCampaignId) throw new Error("Select a campaign first");
      await ledgerApi.createSourceRecord(activeCampaignId, {
        name: sourceForm.name.trim(),
        sourceType: sourceForm.sourceType.trim(),
        searchQuery: sourceForm.searchQuery.trim(),
        status: sourceForm.status,
        resultsFound: Number(sourceForm.resultsFound) || 0,
        importedCount: Number(sourceForm.importedCount) || 0,
        notes: sourceForm.notes.trim(),
      });
      setSourceForm(defaultSourceForm);
    });

  const createProject = async () => {
    setError("");
    try {
      const result = await ledgerApi.createProject(projectForm);
      setProjectForm(defaultProjectForm);
      setCampaignForm((current) => ({ ...current, projectId: result.project.id }));
      await loadLedger(activeCampaignId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create project");
    }
  };

  const saveProjectContext = () =>
    mutate(async () => {
      if (!campaignProject) throw new Error("Select a project first");
      await ledgerApi.updateProject(campaignProject.id, {
        title: projectEditForm.title.trim(),
        description: projectEditForm.description.trim(),
      });
    });

  const addMentor = () =>
    mutate(async () => {
      if (!activeCampaignId) throw new Error("Select a campaign first");
      await ledgerApi.addMentor(activeCampaignId, mentorForm);
      setMentorForm(defaultMentorForm);
    });

  const recordResponse = (mentor: MentorProfile) =>
    mutate(async () => {
      const message = sentMessages.find((item) => item.mentorProfileId === mentor.id) || null;
      await ledgerApi.recordResponse({
        campaignId: mentor.campaignId,
        mentorProfileId: mentor.id,
        messageDraftId: message?.id || null,
        classification: responseClass[mentor.id] || "unknown",
        body: responseText[mentor.id] || "",
        nextAction: "Review response and decide whether to continue, close, or schedule a follow-up.",
      });
      setResponseText((current) => ({ ...current, [mentor.id]: "" }));
    });

  const saveMentorEdit = (mentor: MentorProfile) =>
    mutate(async () => {
      const edit = mentorEdits[mentor.id];
      await ledgerApi.updateMentor(mentor.id, {
        notes: edit?.notes ?? mentor.notes,
        stage: edit?.stage ?? mentor.stage,
      });
    });

  const recordOutcome = (mentor: MentorProfile) =>
    mutate(async () => {
      await ledgerApi.recordOutcome({
        campaignId: mentor.campaignId,
        mentorProfileId: mentor.id,
        status: outcomeStatus[mentor.id] || "open",
        summary: outcomeText[mentor.id] || "",
        valueLevel: "medium",
      });
      setOutcomeText((current) => ({ ...current, [mentor.id]: "" }));
    });

  const loadUsageReport = async () => {
    if (!activeCampaignId) return;
    setError("");
    try {
      setUsageReport(await ledgerApi.usageReport(activeCampaignId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load usage report");
    }
  };

  const generateInvoiceReport = async () => {
    if (!activeCampaignId) return;
    setError("");
    try {
      const result = await ledgerApi.generateInvoice(activeCampaignId);
      setUsageReport(result.usageReport);
      await loadLedger(activeCampaignId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate invoice report");
    }
  };

  const importMentorCsv = (preview: boolean) =>
    mutate(async () => {
      if (!activeCampaignId) throw new Error("Select a campaign first");
      const sourceRecordId = details?.sourceRecords.some((source) => source.id === csvSourceRecordId) ? csvSourceRecordId : undefined;
      const result = await ledgerApi.importMentorCsv(activeCampaignId, csvText, preview, compactColumnMap(csvColumnMap), sourceRecordId);
      setCsvImportResult(result);
    });

  const openNextAction = async (action: NextActionRecommendation) => {
    if (action.campaignId && action.campaignId !== activeCampaignId) {
      await loadLedger(action.campaignId);
    }

    if (action.mentorProfileId) {
      setSelectedMentorId(action.mentorProfileId);
      setQuery("");
    }

    if (action.type === "follow_up_due") {
      setResultFilter("follow_up_due");
    } else if (action.type === "record_response_outcome") {
      setResultFilter("awaiting_outcome");
    }

    setActiveTab(actionTabMap[action.type]);
  };

  const readCsvFile = async (file: File | null) => {
    setCsvFileStatus("");
    setCsvImportResult(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv") && file.type && file.type !== "text/csv") {
      setCsvFileStatus("Unsupported file type.");
      return;
    }
    try {
      const text = await file.text();
      setCsvText(text);
      setCsvFileStatus(`Loaded ${file.name}.`);
    } catch {
      setCsvFileStatus("Unable to read CSV file.");
    }
  };

  const exportMentorCsv = async () => {
    if (!activeCampaignId) return;
    setError("");
    try {
      const result = await ledgerApi.exportMentorCsv(activeCampaignId);
      downloadText(result.filename, result.csv, "text/csv;charset=utf-8");
      await loadLedger(activeCampaignId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to export mentor CSV");
    }
  };

  const exportCampaignHistoryCsv = async () => {
    if (!activeCampaignId) return;
    setError("");
    try {
      const result = await ledgerApi.exportCampaignHistoryCsv(activeCampaignId);
      downloadText(result.filename, result.csv, "text/csv;charset=utf-8");
      await loadLedger(activeCampaignId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to export campaign history CSV");
    }
  };

  const resolveDuplicateMentor = (mentor: MentorProfile) =>
    mutate(() => ledgerApi.resolveDuplicateMentor(mentor.id, { resolutionNote: "Resolved from duplicate review action" }));

  const dueFollowUps = (details?.followUps || []).filter(
    (followUp) => followUp.status === "scheduled" && new Date(followUp.dueAt).getTime() <= Date.now()
  );
  const resultRows = useMemo(() => {
    const mentors = details?.mentors || [];
    const messages = details?.messages || [];
    const now = Date.now();

    return mentors
      .map((mentor) => {
        const latestResponse = latestByCreatedAt(responsesByMentor.get(mentor.id) || []);
        const latestOutcome = latestByCreatedAt(outcomesByMentor.get(mentor.id) || []);
        const mentorFollowUps = followUpsByMentor.get(mentor.id) || [];
        const latestFollowUp = latestByCreatedAt(mentorFollowUps);
        const hasDueFollowUp = mentorFollowUps.some((followUp) => followUp.status === "scheduled" && new Date(followUp.dueAt).getTime() <= now);
        const sentCount = messages.filter((message) => message.mentorProfileId === mentor.id && message.status === "sent").length;
        const outcomeStatusValue = latestOutcome?.status || "open";
        const awaitingOutcome = Boolean(latestResponse) && !latestOutcome;
        return {
          mentor,
          latestResponse,
          latestOutcome,
          latestFollowUp,
          hasDueFollowUp,
          sentCount,
          outcomeStatusValue,
          awaitingOutcome,
        };
      })
      .filter((row) => {
        if (resultFilter === "all") return true;
        if (resultFilter === "awaiting_outcome") return row.awaitingOutcome;
        if (resultFilter === "follow_up_due") return row.hasDueFollowUp;
        return row.outcomeStatusValue === resultFilter;
      });
  }, [details?.mentors, details?.messages, responsesByMentor, followUpsByMentor, outcomesByMentor, resultFilter]);
  const latestResourceSession = details?.resourceSessions[0] || null;
  const publicTunnelWithoutAuth = Boolean(runtimeStatus?.warnings.includes("ngrok_public_without_basic_auth"));

  const isSensitiveVisible = (key: string) => !privacyMode || revealedSensitive.has(key);
  const revealSensitive = (key: string) =>
    setRevealedSensitive((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });
  const hideSensitive = (key: string) =>
    setRevealedSensitive((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  const togglePrivacyMode = () => {
    if (!privacyMode) setRevealedSensitive(new Set());
    setPrivacyMode((current) => !current);
  };
  const copyRuntimeUrl = async (value: string | null | undefined) => {
    if (!value) return;
    try {
      await navigator.clipboard?.writeText(value);
      setRuntimeCopyStatus("URL copied.");
    } catch {
      setRuntimeCopyStatus("Clipboard blocked. Select the URL text manually.");
    }
  };
  const copyDraftForHandoff = async (message: MessageDraft) => {
    const subject = draftEdits[message.id]?.subject ?? message.subject;
    const body = draftEdits[message.id]?.body ?? message.body;
    const handoffText = `Subject: ${subject}\n\n${body}`;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(handoffText);
      setHandoffStatus((current) => ({
        ...current,
        [message.id]: "Draft copied for manual paste. Final send remains manual.",
      }));
    } catch {
      setHandoffStatus((current) => ({
        ...current,
        [message.id]: "Clipboard blocked. Select and copy the revealed draft manually.",
      }));
    }
  };
  const openProfileForHandoff = (messageId: string, profileUrl: string | null | undefined) => {
    if (!profileUrl) return;
    const opened = window.open(profileUrl, "_blank", "noopener,noreferrer");
    if (opened) {
      opened.opener = null;
      setHandoffStatus((current) => ({
        ...current,
        [messageId]: "Profile opened in a new tab. Paste and send manually after review.",
      }));
    } else {
      setHandoffStatus((current) => ({
        ...current,
        [messageId]: "Profile popup was blocked. Open the mentor profile link manually.",
      }));
    }
  };

  const downloadWorkspaceBackup = async () => {
    setError("");
    setWorkspaceStatus("");
    try {
      const backup = await ledgerApi.workspaceBackup();
      const filename = `maro-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`;
      downloadText(filename, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
      setWorkspacePreview(backup.summary);
      setWorkspaceStatus("Backup exported.");
      await loadLedger(activeCampaignId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to export workspace backup");
    }
  };

  const previewWorkspaceRestore = async () => {
    setError("");
    setWorkspaceStatus("");
    try {
      const result = await ledgerApi.previewWorkspaceRestore(workspaceBackupText);
      setWorkspacePreview(result.summary);
      setWorkspaceStatus("Backup is valid. Review counts before restoring.");
    } catch (err) {
      setWorkspacePreview(null);
      setError(err instanceof Error ? err.message : "Backup validation failed");
    }
  };

  const restoreWorkspace = async () => {
    if (!window.confirm("Restore this MARO backup and replace the current local workspace?")) return;
    setError("");
    setWorkspaceStatus("");
    try {
      const result = await ledgerApi.restoreWorkspace(workspaceBackupText);
      setWorkspacePreview(result.summary);
      setWorkspaceStatus("Workspace restored.");
      setActiveCampaignId("");
      await loadLedger("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to restore workspace");
    }
  };

  const resetWorkspace = async (scope: "queue" | "mentors" | "workspace") => {
    const label = scope === "queue" ? "message queue, replies, follow-ups, outcomes, and billing records" : scope === "mentors" ? "mentors and all related outreach history" : "the full workspace";
    if (!window.confirm(`Reset ${label}? This cannot be undone unless you have a backup.`)) return;
    await mutate(async () => {
      const result = await ledgerApi.resetWorkspace(scope);
      setWorkspacePreview(result.summary);
      setWorkspaceStatus(`Reset completed: ${scope}.`);
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-primary text-primary-foreground">
              <MailPlus className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-semibold leading-none">MARO</div>
              <div className="text-xs text-muted-foreground">MicroMentor outreach operating ledger</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden rounded-md border-emerald-200 bg-emerald-50 text-emerald-700 md:inline-flex">
              Persisted local API
            </Badge>
            <Button variant={privacyMode ? "default" : "outline"} className="rounded-md" onClick={togglePrivacyMode} aria-label={privacyMode ? "Turn privacy mode off" : "Turn privacy mode on"}>
              {privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span className="hidden sm:inline">{privacyMode ? "Privacy on" : "Privacy off"}</span>
            </Button>
            <Button variant="outline" className="rounded-md" onClick={() => void loadLedger(activeCampaignId)} aria-label="Refresh ledger">
              <RefreshCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-5">
        {error ? (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        ) : null}
        {publicTunnelWithoutAuth ? (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            ngrok is exposing this local ledger publicly without `NGROK_BASIC_AUTH`. Set basic auth before sharing the tunnel URL.
          </div>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="rounded-md py-5">
            <CardHeader className="gap-4 px-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="rounded-md bg-primary/10 text-primary hover:bg-primary/10">
                      Command dashboard
                    </Badge>
                    <Badge variant="outline" className="rounded-md">
                      {campaigns.length} campaigns
                    </Badge>
                    <Badge variant="outline" className="rounded-md">
                      Approval gated
                    </Badge>
                  </div>
                  <CardTitle className="text-2xl leading-tight md:text-3xl">
                    Control mentor discovery, review, follow-up, and billing.
                  </CardTitle>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    Campaigns, mentors, message approvals, manual send confirmations, responses, follow-ups, resource costs, and audit events now use the local backend ledger.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/30 p-2 text-center">
                  <div className="min-w-20">
                    <div className="font-mono text-xl font-semibold">{summary?.totals.mentors || 0}</div>
                    <div className="text-xs text-muted-foreground">Mentors</div>
                  </div>
                  <div className="min-w-20">
                    <div className="font-mono text-xl font-semibold">{summary?.totals.strongMatches || 0}</div>
                    <div className="text-xs text-muted-foreground">Strong</div>
                  </div>
                  <div className="min-w-20">
                    <div className="font-mono text-xl font-semibold">{summary?.totals.followUpsDue || 0}</div>
                    <div className="text-xs text-muted-foreground">Due</div>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-5">
              <div className="grid gap-4 md:grid-cols-5">
                <MetricCard icon={<Users className="h-4 w-4 text-primary" />} label="Drafts" value={summary?.totals.drafts || 0} />
                <MetricCard icon={<ClipboardCheck className="h-4 w-4 text-emerald-600" />} label="Approved" value={summary?.totals.approvals || 0} />
                <MetricCard icon={<Send className="h-4 w-4 text-amber-600" />} label="Sent" value={summary?.totals.sent || 0} />
                <MetricCard icon={<AlertTriangle className="h-4 w-4 text-red-600" />} label="Actions" value={summary?.totals.nextActions || nextActions.length} />
                <MetricCard icon={<Euro className="h-4 w-4 text-sky-600" />} label="Final cost" value={formatCurrency(summary?.totals.finalCost || 0)} />
              </div>
              <NextActionPanel actions={nextActions.slice(0, 5)} onOpenAction={(action) => void openNextAction(action)} />
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="rounded-md py-5">
              <CardHeader className="px-5">
                <CardTitle className="text-lg">Active campaign</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-5">
                <select
                  value={activeCampaignId}
                  onChange={(event) => void loadLedger(event.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  disabled={!campaigns.length}
                >
                  {campaigns.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
                <div className="rounded-md border p-4">
                  <div className="text-sm font-medium">{campaign?.title || "No campaign selected"}</div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{campaign?.goal || "Create a campaign to start the ledger."}</p>
                  {campaign ? (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <MiniStat label="Project" value={campaignProject?.title || "Unassigned"} />
                      <MiniStat label="Follow-up rule" value={`${campaignFollowUpDays(campaign)} days`} />
                      <MiniStat label="Tone" value={campaignTone(campaign)} />
                    </div>
                  ) : null}
                </div>
                {campaign ? (
                  <div className="border-t pt-4">
                    <div className="mb-2 text-xs font-medium uppercase tracking-normal text-muted-foreground">Campaign settings</div>
                    <select
                      value={campaignSettingsForm.projectId}
                      onChange={(event) => setCampaignSettingsForm((current) => ({ ...current, projectId: event.target.value }))}
                      className="mb-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
                      disabled={!projects.length}
                    >
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.title}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={campaignSettingsForm.title}
                      onChange={(event) => setCampaignSettingsForm((current) => ({ ...current, title: event.target.value }))}
                      placeholder="Active campaign title"
                      className="mb-2 rounded-md"
                    />
                    <Textarea
                      value={campaignSettingsForm.goal}
                      onChange={(event) => setCampaignSettingsForm((current) => ({ ...current, goal: event.target.value }))}
                      placeholder="Active campaign goal"
                      className="mb-2 min-h-20 rounded-md"
                    />
                    <Input
                      value={campaignSettingsForm.targetMentorType}
                      onChange={(event) => setCampaignSettingsForm((current) => ({ ...current, targetMentorType: event.target.value }))}
                      placeholder="Active target mentor type"
                      className="mb-2 rounded-md"
                    />
                    <div className="mb-2 grid gap-2 md:grid-cols-2">
                      <Input
                        value={campaignSettingsForm.source}
                        onChange={(event) => setCampaignSettingsForm((current) => ({ ...current, source: event.target.value }))}
                        placeholder="Active source"
                        className="rounded-md"
                      />
                      <Input
                        value={campaignSettingsForm.tone}
                        onChange={(event) => setCampaignSettingsForm((current) => ({ ...current, tone: event.target.value }))}
                        placeholder="Active message tone"
                        className="rounded-md"
                      />
                    </div>
                    <div className="mb-2 grid gap-2 md:grid-cols-2">
                      <Input
                        type="number"
                        min="1"
                        max="90"
                        value={campaignSettingsForm.followUpAfterDays}
                        onChange={(event) => setCampaignSettingsForm((current) => ({ ...current, followUpAfterDays: event.target.value }))}
                        placeholder="Active follow-up after days"
                        className="rounded-md"
                      />
                      <select
                        value={campaignSettingsForm.status}
                        onChange={(event) => setCampaignSettingsForm((current) => ({ ...current, status: event.target.value as Campaign["status"] }))}
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      >
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="completed">Completed</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full rounded-md"
                      onClick={() => void saveCampaignSettings()}
                      disabled={
                        !campaign ||
                        !campaignSettingsChanged ||
                        !campaignSettingsForm.projectId ||
                        !campaignSettingsForm.title.trim() ||
                        !campaignSettingsForm.goal.trim() ||
                        !campaignSettingsForm.targetMentorType.trim() ||
                        !campaignSettingsForm.source.trim() ||
                        !campaignSettingsForm.tone.trim()
                      }
                    >
                      <ClipboardCheck className="h-4 w-4" />
                      Save campaign
                    </Button>
                  </div>
                ) : null}
                <Progress value={progress} className="h-2 rounded-md bg-muted" />
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <MiniStat label="Drafted" value={campaign?.messagesDrafted || 0} />
                  <MiniStat label="Sent" value={campaign?.messagesSent || 0} />
                  <MiniStat label="Replies" value={campaign?.responsesReceived || 0} />
                </div>
              </CardContent>
            </Card>

            <RuntimeExposurePanel runtimeStatus={runtimeStatus} healthStatus={healthStatus} copyStatus={runtimeCopyStatus} onCopyUrl={copyRuntimeUrl} />
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as LedgerTab)} className="mt-5 gap-4">
          <div className="overflow-x-auto">
            <TabsList className="h-10 rounded-md">
              <TabsTrigger value="ledger" className="rounded-md">
                <Gauge className="h-4 w-4" />
                Ledger
              </TabsTrigger>
              <TabsTrigger value="mentors" className="rounded-md">
                <Users className="h-4 w-4" />
                Mentors
              </TabsTrigger>
              <TabsTrigger value="review" className="rounded-md">
                <FileText className="h-4 w-4" />
                Review
              </TabsTrigger>
              <TabsTrigger value="responses" className="rounded-md">
                <MessageSquareReply className="h-4 w-4" />
                Responses
              </TabsTrigger>
              <TabsTrigger value="billing" className="rounded-md">
                <Euro className="h-4 w-4" />
                Billing
              </TabsTrigger>
              <TabsTrigger value="audit" className="rounded-md">
                <ShieldCheck className="h-4 w-4" />
                Audit
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="ledger" className="grid gap-4 lg:grid-cols-[1fr_380px]">
            <Card className="rounded-md py-5">
              <CardHeader className="px-5">
                <CardTitle className="text-lg">Campaign ledger</CardTitle>
              </CardHeader>
              <CardContent className="px-5">
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Campaign</th>
                        <th className="px-4 py-3 font-medium">Target</th>
                        <th className="px-4 py-3 font-medium">Mentors</th>
                        <th className="px-4 py-3 font-medium">Approved</th>
                        <th className="px-4 py-3 font-medium">Sent</th>
                        <th className="px-4 py-3 font-medium">Responses</th>
                        <th className="px-4 py-3 font-medium">Follow-ups</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {campaigns.map((item) => (
                        <tr key={item.id} className={item.id === activeCampaignId ? "bg-muted/30" : ""}>
                          <td className="px-4 py-3">
                            <button className="text-left font-medium" onClick={() => void loadLedger(item.id)}>
                              {item.title}
                            </button>
                            <div className="text-xs text-muted-foreground">
                              {(projects.find((project) => project.id === item.projectId) || projects[0])?.title || "Unassigned project"} - {item.source}
                            </div>
                          </td>
                          <td className="max-w-[260px] px-4 py-3 text-muted-foreground">{item.targetMentorType}</td>
                          <td className="px-4 py-3 font-mono">{item.totalMentors}</td>
                          <td className="px-4 py-3 font-mono">{item.messagesApproved}</td>
                          <td className="px-4 py-3 font-mono">{item.messagesSent}</td>
                          <td className="px-4 py-3 font-mono">{item.responsesReceived}</td>
                          <td className="px-4 py-3 font-mono">{item.followUpsDue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="rounded-md py-5">
                <CardHeader className="px-5">
                  <CardTitle className="text-lg">Project context</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-5">
                  <div className="rounded-md border bg-muted/20 p-3">
                    <div className="text-sm font-medium">{campaignProject?.title || "No project selected"}</div>
                    <div className="mt-1 text-xs leading-5 text-muted-foreground">
                      {campaignProject?.description || "Projects group related mentor outreach campaigns."}
                    </div>
                  </div>
                  <div className="border-t pt-3">
                    <div className="mb-2 text-xs font-medium uppercase tracking-normal text-muted-foreground">Active project</div>
                    <Input
                      value={projectEditForm.title}
                      onChange={(event) => setProjectEditForm((current) => ({ ...current, title: event.target.value }))}
                      placeholder="Active project title"
                      className="mb-2 rounded-md"
                      disabled={!campaignProject}
                    />
                    <Textarea
                      value={projectEditForm.description}
                      onChange={(event) => setProjectEditForm((current) => ({ ...current, description: event.target.value }))}
                      placeholder="Active project description"
                      className="mb-2 min-h-20 rounded-md"
                      disabled={!campaignProject}
                    />
                    <Button
                      variant="outline"
                      className="w-full rounded-md"
                      onClick={() => void saveProjectContext()}
                      disabled={!campaignProject || !projectEditForm.title.trim() || !projectContextChanged}
                    >
                      <ClipboardCheck className="h-4 w-4" />
                      Save project
                    </Button>
                  </div>
                  <div className="border-t pt-3">
                    <div className="mb-2 text-xs font-medium uppercase tracking-normal text-muted-foreground">New project</div>
                    <Input
                      value={projectForm.title}
                      onChange={(event) => setProjectForm((current) => ({ ...current, title: event.target.value }))}
                      placeholder="New project title"
                      className="mb-2 rounded-md"
                    />
                    <Textarea
                      value={projectForm.description}
                      onChange={(event) => setProjectForm((current) => ({ ...current, description: event.target.value }))}
                      placeholder="New project description"
                      className="mb-2 min-h-20 rounded-md"
                    />
                    <Button variant="outline" className="w-full rounded-md" onClick={() => void createProject()} disabled={!projectForm.title.trim()}>
                      <Plus className="h-4 w-4" />
                      Create project
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-md py-5">
                <CardHeader className="px-5">
                  <CardTitle className="text-lg">Source searches</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-5">
                  {(details?.sourceRecords || []).map((source) => (
                    <div key={source.id} className="rounded-md border p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{source.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {source.sourceType} - {source.status}
                            {source.searchedAt ? ` - ${formatDate(source.searchedAt)}` : ""}
                          </div>
                        </div>
                        <Badge variant="outline" className="rounded-md">
                          {source.importedCount}/{source.resultsFound}
                        </Badge>
                      </div>
                      {source.searchQuery ? <div className="mt-2 text-xs text-muted-foreground">Query: {source.searchQuery}</div> : null}
                      {source.notes ? <div className="mt-2 text-xs leading-5 text-muted-foreground">{source.notes}</div> : null}
                    </div>
                  ))}
                  {!details?.sourceRecords.length ? (
                    <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                      No source searches recorded yet.
                    </div>
                  ) : null}
                  <div className="border-t pt-3">
                    <div className="mb-2 text-xs font-medium uppercase tracking-normal text-muted-foreground">Record source</div>
                    <Input
                      value={sourceForm.name}
                      onChange={(event) => setSourceForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Source search name"
                      className="mb-2 rounded-md"
                    />
                    <div className="mb-2 grid gap-2 md:grid-cols-2">
                      <Input
                        value={sourceForm.sourceType}
                        onChange={(event) => setSourceForm((current) => ({ ...current, sourceType: event.target.value }))}
                        placeholder="Source type"
                        className="rounded-md"
                      />
                      <select
                        aria-label="Source status"
                        value={sourceForm.status}
                        onChange={(event) => setSourceForm((current) => ({ ...current, status: event.target.value as MentorSource["status"] }))}
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      >
                        <option value="planned">Planned</option>
                        <option value="searched">Searched</option>
                        <option value="imported">Imported</option>
                        <option value="skipped">Skipped</option>
                      </select>
                    </div>
                    <Input
                      value={sourceForm.searchQuery}
                      onChange={(event) => setSourceForm((current) => ({ ...current, searchQuery: event.target.value }))}
                      placeholder="Search query or filter"
                      className="mb-2 rounded-md"
                    />
                    <div className="mb-2 grid gap-2 md:grid-cols-2">
                      <Input
                        type="number"
                        min="0"
                        value={sourceForm.resultsFound}
                        onChange={(event) => setSourceForm((current) => ({ ...current, resultsFound: event.target.value }))}
                        placeholder="Results found"
                        className="rounded-md"
                      />
                      <Input
                        type="number"
                        min="0"
                        value={sourceForm.importedCount}
                        onChange={(event) => setSourceForm((current) => ({ ...current, importedCount: event.target.value }))}
                        placeholder="Imported count"
                        className="rounded-md"
                      />
                    </div>
                    <Textarea
                      value={sourceForm.notes}
                      onChange={(event) => setSourceForm((current) => ({ ...current, notes: event.target.value }))}
                      placeholder="Source notes"
                      className="mb-2 min-h-20 rounded-md"
                    />
                    <Button variant="outline" className="w-full rounded-md" onClick={() => void recordSourceSearch()} disabled={!activeCampaignId || !sourceForm.name.trim()}>
                      <Search className="h-4 w-4" />
                      Record source
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-md py-5">
                <CardHeader className="px-5">
                  <CardTitle className="text-lg">New campaign</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-5">
                  <select
                    value={campaignForm.projectId || campaignProject?.id || projects[0]?.id || ""}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, projectId: event.target.value }))}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    disabled={!projects.length}
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </select>
                  <Input value={campaignForm.title} onChange={(event) => setCampaignForm((current) => ({ ...current, title: event.target.value }))} placeholder="Campaign title" className="rounded-md" />
                  <Textarea value={campaignForm.goal} onChange={(event) => setCampaignForm((current) => ({ ...current, goal: event.target.value }))} placeholder="Outreach goal" className="min-h-24 rounded-md" />
                  <Input value={campaignForm.targetMentorType} onChange={(event) => setCampaignForm((current) => ({ ...current, targetMentorType: event.target.value }))} placeholder="Target mentor type" className="rounded-md" />
                  <Input value={campaignForm.source} onChange={(event) => setCampaignForm((current) => ({ ...current, source: event.target.value }))} placeholder="Source" className="rounded-md" />
                  <Input value={campaignForm.tone} onChange={(event) => setCampaignForm((current) => ({ ...current, tone: event.target.value }))} placeholder="Message tone" className="rounded-md" />
                  <Input
                    type="number"
                    min="1"
                    max="90"
                    value={campaignForm.followUpAfterDays}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, followUpAfterDays: event.target.value }))}
                    placeholder="Follow-up after days"
                    className="rounded-md"
                  />
                  <Button className="w-full rounded-md" onClick={() => void createCampaign()} disabled={!campaignForm.title.trim() || !campaignForm.goal.trim() || !projects.length}>
                    <Plus className="h-4 w-4" />
                    Create campaign
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="mentors" className="grid gap-4 xl:grid-cols-[1fr_390px]">
            <Card className="rounded-md py-5">
              <CardHeader className="px-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <CardTitle className="text-lg">Mentor profiles and fit scores</CardTitle>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search mentors" className="h-9 rounded-md pl-9 sm:w-64" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-5">
                <div className="space-y-3">
                  {filteredMentors.map((mentor) => {
                    const assessment = assessmentsByMentor.get(mentor.id);
                    const mentorMessages = messagesByMentor.get(mentor.id) || [];
                    return (
                      <div key={mentor.id} className="rounded-md border p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-medium">{mentor.name}</div>
                              <Badge variant="outline" className="rounded-md">
                                {stageLabel[mentor.stage] || mentor.stage}
                              </Badge>
                              {assessment ? (
                                <Badge className="rounded-md bg-primary/10 text-primary hover:bg-primary/10">
                                  {assessment.score}% fit
                                </Badge>
                              ) : null}
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">{mentor.headline}</div>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{mentor.bio || "No profile context recorded yet."}</p>
                            <div className="mt-2 text-xs text-muted-foreground">
                              {(assessment?.reasonsJson || []).slice(0, 2).join(" ")}
                            </div>
                            <div className="mt-3 grid gap-2 md:grid-cols-[180px_1fr_auto_auto]">
                              <select
                                value={mentorEdits[mentor.id]?.stage || mentor.stage}
                                onChange={(event) =>
                                  setMentorEdits((current) => ({
                                    ...current,
                                    [mentor.id]: {
                                      notes: current[mentor.id]?.notes ?? mentor.notes,
                                      stage: event.target.value as MentorProfile["stage"],
                                    },
                                  }))
                                }
                                className="h-9 rounded-md border bg-background px-3 text-sm"
                              >
                                {Object.entries(stageLabel).map(([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                              <Input
                                type={privacyMode && !isSensitiveVisible(`mentor-notes:${mentor.id}`) ? "password" : "text"}
                                value={mentorEdits[mentor.id]?.notes ?? mentor.notes}
                                onChange={(event) =>
                                  setMentorEdits((current) => ({
                                    ...current,
                                    [mentor.id]: {
                                      stage: current[mentor.id]?.stage ?? mentor.stage,
                                      notes: event.target.value,
                                    },
                                  }))
                                }
                                placeholder="Mentor notes"
                                className="h-9 rounded-md"
                              />
                              <Button
                                variant="outline"
                                className="rounded-md"
                                onClick={() =>
                                  isSensitiveVisible(`mentor-notes:${mentor.id}`)
                                    ? hideSensitive(`mentor-notes:${mentor.id}`)
                                    : revealSensitive(`mentor-notes:${mentor.id}`)
                                }
                              >
                                {isSensitiveVisible(`mentor-notes:${mentor.id}`) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                              <Button variant="outline" className="rounded-md" onClick={() => void saveMentorEdit(mentor)}>
                                Save
                              </Button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" className="rounded-md" onClick={() => setSelectedMentorId(mentor.id)}>
                              Inspect
                            </Button>
                            <Button variant="outline" className="rounded-md" onClick={() => void mutate(() => ledgerApi.createDraft(activeCampaignId, mentor.id))}>
                              <FileText className="h-4 w-4" />
                              Draft
                            </Button>
                            <Badge variant="outline" className="rounded-md">
                              {mentorMessages.length} messages
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!filteredMentors.length ? (
                    <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                      No mentors in this campaign yet.
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <MentorDetailPanel
              mentor={selectedMentor}
              assessment={selectedMentor ? assessmentsByMentor.get(selectedMentor.id) || null : null}
              messages={selectedMentor ? messagesByMentor.get(selectedMentor.id) || [] : []}
              approvalsByMessage={approvalsByMessage}
              sendAttempts={selectedMentor ? sendAttemptsByMentor.get(selectedMentor.id) || [] : []}
              responses={selectedMentor ? responsesByMentor.get(selectedMentor.id) || [] : []}
              followUps={selectedMentor ? followUpsByMentor.get(selectedMentor.id) || [] : []}
              outcomes={selectedMentor ? outcomesByMentor.get(selectedMentor.id) || [] : []}
              nextActions={selectedMentor ? nextActions.filter((action) => action.mentorProfileId === selectedMentor.id) : []}
              auditEvents={
                selectedMentor
                  ? (details?.auditEvents || []).filter(
                      (event) =>
                        event.entityId === selectedMentor.id ||
                        (messagesByMentor.get(selectedMentor.id) || []).some((message) => message.id === event.entityId)
                    )
                  : []
              }
              privacyMode={privacyMode}
              isSensitiveVisible={isSensitiveVisible}
              onRevealSensitive={revealSensitive}
              onHideSensitive={hideSensitive}
              onCreateDraft={(mentor) => void mutate(() => ledgerApi.createDraft(activeCampaignId, mentor.id))}
              onResolveDuplicate={(mentor) => void resolveDuplicateMentor(mentor)}
            />

            <Card className="rounded-md py-5">
              <CardHeader className="px-5">
                <CardTitle className="text-lg">Add mentor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-5">
                <Input value={mentorForm.name} onChange={(event) => setMentorForm((current) => ({ ...current, name: event.target.value }))} placeholder="Name" className="rounded-md" />
                <Input value={mentorForm.company} onChange={(event) => setMentorForm((current) => ({ ...current, company: event.target.value }))} placeholder="Company or organization" className="rounded-md" />
                <Input value={mentorForm.headline} onChange={(event) => setMentorForm((current) => ({ ...current, headline: event.target.value }))} placeholder="Headline or role" className="rounded-md" />
                <Textarea value={mentorForm.bio} onChange={(event) => setMentorForm((current) => ({ ...current, bio: event.target.value }))} placeholder="Bio, relevant context, or why they may help" className="min-h-24 rounded-md" />
                <Input value={mentorForm.skills} onChange={(event) => setMentorForm((current) => ({ ...current, skills: event.target.value }))} placeholder="Skills, comma separated" className="rounded-md" />
                <Input value={mentorForm.profileUrl} onChange={(event) => setMentorForm((current) => ({ ...current, profileUrl: event.target.value }))} placeholder="Profile URL" className="rounded-md" />
                <Textarea value={mentorForm.notes} onChange={(event) => setMentorForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Internal notes" className="min-h-20 rounded-md" />
                <Button className="w-full rounded-md" onClick={() => void addMentor()} disabled={!mentorForm.name.trim() || !activeCampaignId}>
                  <Plus className="h-4 w-4" />
                  Add and score
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-md py-5">
              <CardHeader className="px-5">
                <CardTitle className="text-lg">CSV intake</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-5">
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  className="rounded-md"
                  onChange={(event) => void readCsvFile(event.target.files?.[0] || null)}
                />
                {csvFileStatus ? <div className="text-xs text-muted-foreground">{csvFileStatus}</div> : null}
                <Textarea
                  value={csvText}
                  onChange={(event) => {
                    setCsvText(event.target.value);
                    setCsvImportResult(null);
                  }}
                  className="min-h-40 rounded-md font-mono text-xs"
                  placeholder="name,company,headline,bio,skills,profileUrl,notes"
                />
                <label className="grid gap-1 text-xs text-muted-foreground">
                  <span>Link import to source search</span>
                  <select
                    aria-label="CSV import source search"
                    value={csvSourceRecordId}
                    onChange={(event) => setCsvSourceRecordId(event.target.value)}
                    className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
                  >
                    <option value="">No source link</option>
                    {(details?.sourceRecords || []).map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name} ({source.importedCount}/{source.resultsFound})
                      </option>
                    ))}
                  </select>
                </label>
                {csvHeaders.length ? (
                  <div className="rounded-md border bg-muted/20 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">Column mapping</div>
                      <Badge variant="outline" className="rounded-md">
                        {csvHeaders.length} headers
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {csvColumnFields.map((field) => (
                        <label key={field.key} className="grid gap-1 text-xs text-muted-foreground">
                          <span>
                            {field.label}
                            {field.required ? " *" : ""}
                          </span>
                          <select
                            value={csvColumnMap[field.key]}
                            onChange={(event) =>
                              setCsvColumnMap((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                            className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
                          >
                            <option value="">Do not import</option>
                            {csvHeaders.map((header) => (
                              <option key={`${field.key}:${header}`} value={header}>
                                {header}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                    {!csvColumnMap.name ? <div className="mt-2 text-xs text-red-600">Map a name column before importing.</div> : null}
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="rounded-md" onClick={() => void importMentorCsv(true)} disabled={!csvText.trim() || !activeCampaignId || !csvColumnMap.name}>
                    Preview
                  </Button>
                  <Button className="rounded-md" onClick={() => void importMentorCsv(false)} disabled={!csvText.trim() || !activeCampaignId || !csvColumnMap.name}>
                    Import
                  </Button>
                </div>
                <Button variant="outline" className="w-full rounded-md" onClick={() => void exportMentorCsv()} disabled={!activeCampaignId}>
                  Export mentors CSV
                </Button>
                <Button variant="outline" className="w-full rounded-md" onClick={() => void exportCampaignHistoryCsv()} disabled={!activeCampaignId}>
                  Export campaign history CSV
                </Button>
                {csvImportResult ? (
                  <div className="rounded-md border bg-muted/20 p-3 text-sm">
                    <div className="font-medium">
                      {csvImportResult.preview ? "Preview" : "Imported"} {csvImportResult.importedCount} of {csvImportResult.totalRows}
                    </div>
                    {csvImportResult.skipped.length ? (
                      <div className="mt-2 text-xs leading-5 text-muted-foreground">
                        Skipped: {csvImportResult.skipped.map((item) => `row ${item.row} ${item.reason}`).join(", ")}
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-muted-foreground">No duplicate or invalid rows detected.</div>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="review" className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <ReviewColumn
              title="Needs review"
              messages={pendingReview}
              details={details}
              draftEdits={draftEdits}
              onDraftEdit={setDraftEdits}
              qualityByMessage={qualityByMessage}
              handoffStatus={handoffStatus}
              privacyMode={privacyMode}
              isSensitiveVisible={isSensitiveVisible}
              onRevealSensitive={revealSensitive}
              onHideSensitive={hideSensitive}
              onCopyDraft={copyDraftForHandoff}
              onOpenProfile={openProfileForHandoff}
              action={(message) => {
                const quality = qualityByMessage.get(message.id);
                return (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      className="rounded-md"
                      onClick={() =>
                        void mutate(() => ledgerApi.updateDraft(message.id, draftEdits[message.id] || { subject: message.subject, body: message.body }))
                      }
                    >
                      Save edit
                    </Button>
                    <Button className="rounded-md" onClick={() => void mutate(() => ledgerApi.approveDraft(message.id, "Approved in command center"))} disabled={quality?.status === "blocked"}>
                      <Check className="h-4 w-4" />
                      Approve
                    </Button>
                    <Button variant="outline" className="rounded-md" onClick={() => void mutate(() => ledgerApi.rejectDraft(message.id, "Rejected in command center"))}>
                      Reject
                    </Button>
                  </div>
                );
              }}
            />
            <ReviewColumn
              title="Approved, awaiting manual send confirmation"
              messages={approvedMessages}
              details={details}
              draftEdits={draftEdits}
              onDraftEdit={setDraftEdits}
              qualityByMessage={qualityByMessage}
              handoffStatus={handoffStatus}
              privacyMode={privacyMode}
              isSensitiveVisible={isSensitiveVisible}
              onRevealSensitive={revealSensitive}
              onHideSensitive={hideSensitive}
              onCopyDraft={copyDraftForHandoff}
              onOpenProfile={openProfileForHandoff}
              action={(message) => (
                <div className="space-y-2">
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Input
                      type={privacyMode && !isSensitiveVisible(`send-evidence:${message.id}`) ? "password" : "text"}
                      value={sendEvidence[message.id] || ""}
                      onChange={(event) => setSendEvidence((current) => ({ ...current, [message.id]: event.target.value }))}
                      placeholder="Paste manual send evidence"
                      className="rounded-md"
                    />
                    <Button
                      variant="outline"
                      className="rounded-md"
                      onClick={() =>
                        isSensitiveVisible(`send-evidence:${message.id}`)
                          ? hideSensitive(`send-evidence:${message.id}`)
                          : revealSensitive(`send-evidence:${message.id}`)
                      }
                    >
                      {isSensitiveVisible(`send-evidence:${message.id}`) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button
                    className="w-full rounded-md"
                    onClick={() => void mutate(() => ledgerApi.confirmSend(message.id, sendEvidence[message.id] || ""))}
                    disabled={!sendEvidence[message.id]?.trim()}
                  >
                    <Send className="h-4 w-4" />
                    Confirm manually sent
                  </Button>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Input
                      value={sendFailureNotes[message.id] || ""}
                      onChange={(event) => setSendFailureNotes((current) => ({ ...current, [message.id]: event.target.value }))}
                      placeholder="Record failed manual attempt"
                      className="rounded-md"
                    />
                    <Button
                      variant="outline"
                      className="rounded-md border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700"
                      onClick={() => void mutate(() => ledgerApi.recordFailedSendAttempt(message.id, sendFailureNotes[message.id] || ""))}
                      disabled={!sendFailureNotes[message.id]?.trim()}
                    >
                      Record failed
                    </Button>
                  </div>
                </div>
              )}
            />
          </TabsContent>

          <TabsContent value="responses" className="space-y-4">
            <Card className="rounded-md py-5">
              <CardHeader className="px-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle className="text-lg">Campaign results</CardTitle>
                    <div className="mt-1 text-sm text-muted-foreground">Response rate, booked calls, open loops, and overdue follow-ups from the persisted ledger.</div>
                  </div>
                  <Button variant="outline" className="rounded-md" onClick={() => void exportCampaignHistoryCsv()} disabled={!activeCampaignId}>
                    Export campaign history CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 px-5">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <MiniStat label="Contacted" value={details?.results.totals.contacted || 0} />
                  <MiniStat label="Response rate" value={`${details?.results.rates.responseRate || 0}%`} />
                  <MiniStat label="Booking rate" value={`${details?.results.rates.bookingRate || 0}%`} />
                  <MiniStat label="Positive rate" value={`${details?.results.rates.positiveOutcomeRate || 0}%`} />
                  <MiniStat label="Overdue follow-ups" value={details?.results.totals.overdueFollowUps || 0} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {resultFilters.map((filter) => (
                    <Button
                      key={filter.value}
                      variant={resultFilter === filter.value ? "default" : "outline"}
                      className="h-8 rounded-md px-3 text-xs"
                      onClick={() => setResultFilter(filter.value)}
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[1120px] text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Mentor</th>
                        <th className="px-4 py-3 font-medium">Latest response</th>
                        <th className="px-4 py-3 font-medium">Outcome</th>
                        <th className="px-4 py-3 font-medium">Follow-up</th>
                        <th className="min-w-[520px] px-4 py-3 font-medium">Update outcome</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {resultRows.map((row) => (
                        <tr key={row.mentor.id}>
                          <td className="min-w-[520px] px-4 py-3">
                            <button className="text-left font-medium" onClick={() => setSelectedMentorId(row.mentor.id)}>
                              {row.mentor.name}
                            </button>
                            <div className="text-xs text-muted-foreground">{row.sentCount} sent messages</div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="rounded-md">
                              {row.latestResponse?.classification.replace("_", " ") || "none"}
                            </Badge>
                            {row.awaitingOutcome ? <div className="mt-1 text-xs text-amber-700">Needs outcome decision</div> : null}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="rounded-md">
                              {row.outcomeStatusValue.replace("_", " ")}
                            </Badge>
                            {row.latestOutcome ? <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">{row.latestOutcome.summary}</div> : null}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={row.hasDueFollowUp ? "rounded-md border-amber-200 bg-amber-50 text-amber-700" : "rounded-md"}>
                              {row.hasDueFollowUp ? "due" : row.latestFollowUp?.status || "none"}
                            </Badge>
                            {row.latestFollowUp ? <div className="mt-1 text-xs text-muted-foreground">{formatDate(row.latestFollowUp.dueAt)}</div> : null}
                          </td>
                          <td className="px-4 py-3">
                            <div className="grid gap-2 md:grid-cols-[150px_1fr_auto]">
                              <select
                                value={outcomeStatus[row.mentor.id] || row.outcomeStatusValue}
                                onChange={(event) => setOutcomeStatus((current) => ({ ...current, [row.mentor.id]: event.target.value as OutreachOutcome["status"] }))}
                                className="h-9 rounded-md border bg-background px-3 text-sm"
                              >
                                <option value="open">Open</option>
                                <option value="booked">Booked</option>
                                <option value="helpful">Helpful</option>
                                <option value="declined">Declined</option>
                                <option value="no_response">No response</option>
                                <option value="not_relevant">Not relevant</option>
                                <option value="closed">Closed</option>
                              </select>
                              <Input
                                value={outcomeText[row.mentor.id] || ""}
                                onChange={(event) => setOutcomeText((current) => ({ ...current, [row.mentor.id]: event.target.value }))}
                                placeholder="Outcome summary"
                                className="h-9 rounded-md"
                              />
                              <Button variant="outline" className="h-9 rounded-md" onClick={() => void recordOutcome(row.mentor)} disabled={!outcomeText[row.mentor.id]?.trim()}>
                                Save
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!resultRows.length ? <div className="p-6 text-center text-sm text-muted-foreground">No mentors match this results filter.</div> : null}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
              <Card className="rounded-md py-5">
              <CardHeader className="px-5">
                <CardTitle className="text-lg">Response inbox</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-5">
                {(details?.responses || []).map((response) => {
                  const mentor = details?.mentors.find((item) => item.id === response.mentorProfileId);
                  return (
                    <div key={response.id} className="rounded-md border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{mentor?.name || "Unknown mentor"}</div>
                        <Badge variant="outline" className="rounded-md">
                          {response.classification.replace("_", " ")}
                        </Badge>
                      </div>
                      <SensitiveText
                        className="mt-2"
                        privacyMode={privacyMode}
                        visible={isSensitiveVisible(`response-body:${response.id}`)}
                        onReveal={() => revealSensitive(`response-body:${response.id}`)}
                        onHide={() => hideSensitive(`response-body:${response.id}`)}
                        placeholder="Response text hidden"
                      >
                        {response.body || "No response text recorded."}
                      </SensitiveText>
                      <div className="mt-2 text-xs text-muted-foreground">{response.nextAction}</div>
                    </div>
                  );
                })}
                {!details?.responses.length ? (
                  <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No responses recorded yet.
                  </div>
                ) : null}
              </CardContent>
            </Card>

              <Card className="rounded-md py-5">
              <CardHeader className="px-5">
                <CardTitle className="text-lg">Record response</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-5">
                {details?.mentors.map((mentor) => (
                  <div key={mentor.id} className="rounded-md border p-3">
                    <div className="mb-2 text-sm font-medium">{mentor.name}</div>
                    <select
                      value={responseClass[mentor.id] || "unknown"}
                      onChange={(event) => setResponseClass((current) => ({ ...current, [mentor.id]: event.target.value as MentorResponse["classification"] }))}
                      className="mb-2 h-9 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="interested">Interested</option>
                      <option value="more_info">More info</option>
                      <option value="not_interested">Not interested</option>
                      <option value="unavailable">Unavailable</option>
                      <option value="unknown">Unknown</option>
                    </select>
                    <Textarea
                      value={responseText[mentor.id] || ""}
                      onChange={(event) => setResponseText((current) => ({ ...current, [mentor.id]: event.target.value }))}
                      placeholder="Paste or summarize reply"
                      className="mb-2 min-h-20 rounded-md"
                    />
                    <Button variant="outline" className="w-full rounded-md" onClick={() => void recordResponse(mentor)} disabled={!responseText[mentor.id]?.trim()}>
                      <MessageSquareReply className="h-4 w-4" />
                      Record
                    </Button>
                    <div className="mt-3 border-t pt-3">
                      <select
                        value={outcomeStatus[mentor.id] || "open"}
                        onChange={(event) => setOutcomeStatus((current) => ({ ...current, [mentor.id]: event.target.value as OutreachOutcome["status"] }))}
                        className="mb-2 h-9 w-full rounded-md border bg-background px-3 text-sm"
                      >
                        <option value="open">Open</option>
                        <option value="booked">Booked</option>
                        <option value="helpful">Helpful</option>
                        <option value="declined">Declined</option>
                        <option value="no_response">No response</option>
                        <option value="not_relevant">Not relevant</option>
                        <option value="closed">Closed</option>
                      </select>
                      <Input
                        value={outcomeText[mentor.id] || ""}
                        onChange={(event) => setOutcomeText((current) => ({ ...current, [mentor.id]: event.target.value }))}
                        placeholder="Outcome summary"
                        className="mb-2 rounded-md"
                      />
                      <Button variant="outline" className="w-full rounded-md" onClick={() => void recordOutcome(mentor)} disabled={!outcomeText[mentor.id]?.trim()}>
                        Record outcome
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="billing" className="grid gap-4 lg:grid-cols-[1fr_420px]">
            <Card className="rounded-md py-5">
              <CardHeader className="px-5">
                <CardTitle className="text-lg">Follow-up queue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-5">
                {(details?.followUps || []).map((followUp) => {
                  const mentor = details?.mentors.find((item) => item.id === followUp.mentorProfileId);
                  const linkedDraft = followUp.messageDraftId ? details?.messages.find((message) => message.id === followUp.messageDraftId) : null;
                  const due = new Date(followUp.dueAt).getTime() <= Date.now();
                  return (
                    <div key={followUp.id} className="rounded-md border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{mentor?.name || "Unknown mentor"}</div>
                        <Badge variant="outline" className={due && followUp.status === "scheduled" ? "rounded-md border-amber-200 bg-amber-50 text-amber-700" : "rounded-md"}>
                          {followUp.status}
                        </Badge>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">Due {formatDate(followUp.dueAt)}</div>
                      <SensitiveText
                        className="mt-2"
                        privacyMode={privacyMode}
                        visible={isSensitiveVisible(`follow-up:${followUp.id}`)}
                        onReveal={() => revealSensitive(`follow-up:${followUp.id}`)}
                        onHide={() => hideSensitive(`follow-up:${followUp.id}`)}
                        placeholder="Follow-up message hidden"
                      >
                        {followUp.suggestedMessage}
                      </SensitiveText>
                      {followUp.status === "scheduled" ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {linkedDraft && linkedDraft.status !== "rejected" ? (
                            <Button variant="outline" className="rounded-md" onClick={() => setActiveTab("review")}>
                              <ClipboardCheck className="h-4 w-4" />
                              Review draft
                            </Button>
                          ) : (
                            <Button variant="outline" className="rounded-md" onClick={() => void mutate(() => ledgerApi.createFollowUpDraft(followUp.id))}>
                              <MailPlus className="h-4 w-4" />
                              Draft follow-up
                            </Button>
                          )}
                          <Button variant="outline" className="rounded-md" onClick={() => void mutate(() => ledgerApi.completeFollowUp(followUp.id))}>
                            Complete
                          </Button>
                          <Button variant="outline" className="rounded-md" onClick={() => void mutate(() => ledgerApi.cancelFollowUp(followUp.id))}>
                            Cancel
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {!details?.followUps.length ? (
                  <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No follow-ups scheduled yet.
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="rounded-md py-5">
                <CardHeader className="px-5">
                  <CardTitle className="text-lg">Resource billing</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-5">
                  <div className="grid grid-cols-2 gap-2">
                    <MiniStat label="Due follow-ups" value={dueFollowUps.length} />
                    <MiniStat label="Billing records" value={details?.billingRecords.length || 0} />
                    <MiniStat label="Invoices" value={details?.invoiceRecords.length || 0} />
                    <MiniStat label="Final cost" value={formatCurrency((details?.billingRecords || []).reduce((sum, item) => sum + item.finalCost, 0))} />
                  </div>
                  {latestResourceSession ? (
                    <div className="rounded-md border bg-muted/20 p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">Measurement</span>
                        <Badge variant="outline" className="rounded-md">
                          {latestResourceSession.measurementMode}
                        </Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <MiniStat label="CPU hrs" value={latestResourceSession.cpuCoreHours.toFixed(8)} />
                        <MiniStat label="RAM GB hrs" value={latestResourceSession.ramGbHours.toFixed(8)} />
                        <MiniStat label="Bandwidth GB" value={latestResourceSession.bandwidthGb.toFixed(8)} />
                        <MiniStat label="kWh est." value={latestResourceSession.estimatedKwh.toFixed(8)} />
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{latestResourceSession.measurementNote}</p>
                    </div>
                  ) : null}
                  <Button className="w-full rounded-md" onClick={() => activeCampaignId && void mutate(() => ledgerApi.closeResourceSession(activeCampaignId))} disabled={!activeCampaignId}>
                    <Activity className="h-4 w-4" />
                    Generate cost record
                  </Button>
                  <Button variant="outline" className="w-full rounded-md" onClick={() => void loadUsageReport()} disabled={!activeCampaignId}>
                    Load usage report
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full rounded-md"
                    onClick={() => void generateInvoiceReport()}
                    disabled={!activeCampaignId || !(details?.billingRecords.length)}
                  >
                    Generate invoice report
                  </Button>
                  {usageReport ? (
                    <div className="rounded-md border bg-muted/20 p-3 text-sm">
                      <div className="font-medium">Usage report</div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <MiniStat label="Outcomes" value={usageReport.totals.outcomesRecorded} />
                        <MiniStat label="Final" value={formatCurrency(usageReport.totals.finalCost)} />
                        <MiniStat label="Invoices" value={usageReport.invoiceRecords.length} />
                        <MiniStat label="Line items" value={usageReport.billingRecords.length} />
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{usageReport.measurementNote}</p>
                    </div>
                  ) : null}
                  {(details?.invoiceRecords || []).map((invoice) => (
                    <div key={invoice.id} className="rounded-md border p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{invoice.invoiceNumber}</div>
                          <div className="mt-1 text-xs text-muted-foreground">Generated {formatDate(invoice.generatedAt)}</div>
                        </div>
                        <Badge variant="outline" className="rounded-md">
                          {invoice.status}
                        </Badge>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <MiniStat label="Raw" value={formatCurrency(invoice.rawResourceCost)} />
                        <MiniStat label="Final" value={formatCurrency(invoice.finalCost)} />
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{invoice.measurementNote}</p>
                    </div>
                  ))}
                  {(details?.billingRecords || []).map((record) => (
                    <div key={record.id} className="rounded-md border p-3 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Raw resource cost</span>
                        <span className="font-mono">{formatCurrency(record.rawResourceCost)}</span>
                      </div>
                      <div className="mt-1 flex justify-between gap-3">
                        <span className="text-muted-foreground">Final price</span>
                        <span className="font-mono font-semibold">{formatCurrency(record.finalCost)}</span>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">{record.pricingFormula}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="rounded-md py-5">
                <CardHeader className="px-5">
                  <CardTitle className="text-lg">Safety gates</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 px-5 text-sm text-muted-foreground">
                  <SafetyLine text="Drafts must be approved before send confirmation." />
                  <SafetyLine text="Send status requires manual delivery evidence." />
                  <SafetyLine text="Responses and billing events are audit logged." />
                  <SafetyLine text="Invoice reports are local records and do not charge anyone." />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="audit" className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <Card className="rounded-md py-5">
              <CardHeader className="px-5">
                <CardTitle className="text-lg">Audit trail</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 px-5">
                {(details?.auditEvents || summary?.recentActivity || []).map((event) => (
                  <div key={event.id} className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
                    <div>
                      <div className="font-medium">{event.action.replaceAll("_", " ")}</div>
                      <div className="text-xs text-muted-foreground">{event.entityType} - {formatDate(event.createdAt)}</div>
                    </div>
                    <Badge variant="outline" className={event.riskLevel === "high" ? "rounded-md border-red-200 bg-red-50 text-red-700" : "rounded-md"}>
                      {event.riskLevel}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Card className="rounded-md py-5">
                <CardHeader className="px-5">
                  <CardTitle className="text-lg">Operational status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-5">
                  <MiniStat label="Pending review" value={pendingReview.length} />
                  <MiniStat label="Ready to confirm" value={approvedMessages.length} />
                  <MiniStat label="Sent messages" value={sentMessages.length} />
                  <MiniStat label="Loading" value={loading ? "Yes" : "No"} />
                </CardContent>
              </Card>
              <WorkspacePanel
                backupText={workspaceBackupText}
                preview={workspacePreview}
                status={workspaceStatus}
                onBackupTextChange={setWorkspaceBackupText}
                onExport={() => void downloadWorkspaceBackup()}
                onPreview={() => void previewWorkspaceRestore()}
                onRestore={() => void restoreWorkspace()}
                onReset={(scope) => void resetWorkspace(scope)}
              />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function MentorDetailPanel({
  mentor,
  assessment,
  messages,
  approvalsByMessage,
  sendAttempts,
  responses,
  followUps,
  outcomes,
  nextActions,
  auditEvents,
  privacyMode,
  isSensitiveVisible,
  onRevealSensitive,
  onHideSensitive,
  onCreateDraft,
  onResolveDuplicate,
}: {
  mentor: MentorProfile | null;
  assessment: CampaignDetails["assessments"][number] | null;
  messages: CampaignDetails["messages"];
  approvalsByMessage: Map<string, CampaignDetails["approvals"]>;
  sendAttempts: CampaignDetails["sendAttempts"];
  responses: CampaignDetails["responses"];
  followUps: CampaignDetails["followUps"];
  outcomes: CampaignDetails["outcomes"];
  nextActions: NextActionRecommendation[];
  auditEvents: CampaignDetails["auditEvents"];
  privacyMode: boolean;
  isSensitiveVisible: (key: string) => boolean;
  onRevealSensitive: (key: string) => void;
  onHideSensitive: (key: string) => void;
  onCreateDraft: (mentor: MentorProfile) => void;
  onResolveDuplicate: (mentor: MentorProfile) => void;
}) {
  const duplicateAction = mentor ? nextActions.find((action) => action.type === "review_duplicate_profile") : null;

  return (
    <Card className="rounded-md py-5">
      <CardHeader className="px-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Mentor detail</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">Profile, fit, history, and next actions</div>
          </div>
          {mentor ? (
            <Badge variant="outline" className="rounded-md">
              {stageLabel[mentor.stage] || mentor.stage}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-5">
        {!mentor ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Select a mentor to inspect their outreach history.
          </div>
        ) : (
          <>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="font-medium">{mentor.name}</div>
                {assessment ? (
                  <Badge className="rounded-md bg-primary/10 text-primary hover:bg-primary/10">{assessment.score}% fit</Badge>
                ) : null}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">{mentor.headline || "No headline recorded"}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-md border px-2 py-1">Source: {mentor.source || "manual"}</span>
                {mentor.profileUrl ? (
                  <a className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-primary" href={mentor.profileUrl} target="_blank" rel="noreferrer">
                    Profile <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{mentor.bio || "No profile context recorded yet."}</p>
              {mentor.skills.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {mentor.skills.map((skill) => (
                    <Badge key={skill} variant="outline" className="rounded-md">
                      {skill}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Drafts" value={messages.length} />
              <MiniStat label="Sends" value={sendAttempts.length} />
              <MiniStat label="Replies" value={responses.length} />
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-2 text-sm font-medium">Next actions</div>
              <ActionList actions={nextActions.slice(0, 3)} emptyText="No immediate action for this mentor." />
              {mentor && duplicateAction ? (
                <Button variant="outline" className="mt-3 w-full rounded-md" onClick={() => onResolveDuplicate(mentor)}>
                  <Check className="h-4 w-4" />
                  Resolve duplicate
                </Button>
              ) : null}
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-2 text-sm font-medium">Fit reasoning</div>
              <ul className="space-y-1 text-xs leading-5 text-muted-foreground">
                {(assessment?.reasonsJson || ["No fit rationale recorded yet."]).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {assessment?.risksJson.length ? (
                <div className="mt-3 border-t pt-3 text-xs leading-5 text-muted-foreground">
                  Risk notes: {assessment.risksJson.join(" ")}
                </div>
              ) : null}
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-sm font-medium">Contact history</div>
                <Button size="sm" variant="outline" className="h-8 rounded-md" onClick={() => onCreateDraft(mentor)}>
                  <FileText className="h-4 w-4" />
                  Draft
                </Button>
              </div>
              <div className="space-y-2">
                {messages.map((message) => {
                  const approvals = approvalsByMessage.get(message.id) || [];
                  const attempts = sendAttempts.filter((attempt) => attempt.messageDraftId === message.id);
                  return (
                    <div key={message.id} className="rounded-md bg-muted/30 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{message.subject}</div>
                          <div className="mt-1 text-xs text-muted-foreground">Updated {formatDate(message.updatedAt)}</div>
                        </div>
                        <Badge variant="outline" className="rounded-md">
                          {message.status}
                        </Badge>
                      </div>
                      {approvals.length ? (
                        <div className="mt-2 text-xs leading-5 text-muted-foreground">
                          Review: {approvals.map((approval) => `${approval.decision} - ${approval.decisionReason}`).join("; ")}
                        </div>
                      ) : null}
                      {attempts.length ? (
                        <SensitiveText
                          className="mt-2"
                          privacyMode={privacyMode}
                          visible={isSensitiveVisible(`send-proof:${message.id}`)}
                          onReveal={() => onRevealSensitive(`send-proof:${message.id}`)}
                          onHide={() => onHideSensitive(`send-proof:${message.id}`)}
                          placeholder="Send proof hidden"
                        >
                          Send proof: {attempts.map((attempt) => attempt.deliveryEvidence || attempt.status).join("; ")}
                        </SensitiveText>
                      ) : null}
                    </div>
                  );
                })}
                {!messages.length ? <div className="text-sm text-muted-foreground">No messages drafted yet.</div> : null}
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-2 text-sm font-medium">Replies, follow-ups, and outcomes</div>
              <div className="space-y-2 text-xs leading-5 text-muted-foreground">
                {responses.map((response) => (
                  <div key={response.id} className="rounded-md bg-muted/30 p-2">
                    <div className="mb-1 font-medium">{response.classification.replace("_", " ")}</div>
                    <SensitiveText
                      privacyMode={privacyMode}
                      visible={isSensitiveVisible(`detail-response:${response.id}`)}
                      onReveal={() => onRevealSensitive(`detail-response:${response.id}`)}
                      onHide={() => onHideSensitive(`detail-response:${response.id}`)}
                      placeholder="Response text hidden"
                    >
                      {response.body || "No response text recorded."}
                    </SensitiveText>
                  </div>
                ))}
                {followUps.map((followUp) => (
                  <div key={followUp.id} className="rounded-md bg-muted/30 p-2">
                    <div className="mb-1 font-medium">Follow-up {followUp.status}, due {formatDate(followUp.dueAt)}</div>
                    <SensitiveText
                      privacyMode={privacyMode}
                      visible={isSensitiveVisible(`detail-follow-up:${followUp.id}`)}
                      onReveal={() => onRevealSensitive(`detail-follow-up:${followUp.id}`)}
                      onHide={() => onHideSensitive(`detail-follow-up:${followUp.id}`)}
                      placeholder="Follow-up message hidden"
                    >
                      {followUp.suggestedMessage}
                    </SensitiveText>
                  </div>
                ))}
                {outcomes.map((outcome) => (
                  <div key={outcome.id} className="rounded-md bg-muted/30 p-2">
                    Outcome {outcome.status}: {outcome.summary}
                  </div>
                ))}
                {!responses.length && !followUps.length && !outcomes.length ? <div>No replies, follow-ups, or outcomes recorded yet.</div> : null}
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-2 text-sm font-medium">Notes and audit</div>
              <SensitiveText
                privacyMode={privacyMode}
                visible={isSensitiveVisible(`detail-notes:${mentor.id}`)}
                onReveal={() => onRevealSensitive(`detail-notes:${mentor.id}`)}
                onHide={() => onHideSensitive(`detail-notes:${mentor.id}`)}
                placeholder="Internal notes hidden"
              >
                {mentor.notes || "No internal notes recorded."}
              </SensitiveText>
              {auditEvents.length ? (
                <div className="mt-3 border-t pt-3 text-xs leading-5 text-muted-foreground">
                  {auditEvents.slice(0, 4).map((event) => `${event.action} (${event.riskLevel})`).join(", ")}
                </div>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function NextActionPanel({
  actions,
  onOpenAction,
}: {
  actions: NextActionRecommendation[];
  onOpenAction: (action: NextActionRecommendation) => void;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Recommended next actions</div>
          <div className="text-xs text-muted-foreground">Derived from persisted campaign state</div>
        </div>
        <Badge variant="outline" className="rounded-md">
          {actions.length}
        </Badge>
      </div>
      <ActionList
        actions={actions}
        emptyText="No immediate action. Add mentors, draft outreach, or record responses to create the next operating step."
        onOpenAction={onOpenAction}
      />
    </div>
  );
}

function ActionList({
  actions,
  emptyText,
  onOpenAction,
}: {
  actions: NextActionRecommendation[];
  emptyText: string;
  onOpenAction?: (action: NextActionRecommendation) => void;
}) {
  if (!actions.length) {
    return <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{emptyText}</div>;
  }

  return (
    <div className="space-y-2">
      {actions.map((action) => (
        <div key={action.id} className="rounded-md border bg-background p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium">{action.title}</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{action.description}</div>
            </div>
            <Badge variant="outline" className={`rounded-md ${actionPriorityTone[action.priority]}`}>
              {action.priority}
            </Badge>
          </div>
          <div className="mt-2 text-xs leading-5 text-muted-foreground">{action.recommendedAction}</div>
          {action.dueAt ? <div className="mt-2 text-xs text-muted-foreground">Due {formatDate(action.dueAt)}</div> : null}
          {onOpenAction ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <div className="text-xs text-muted-foreground">Opens {actionTabLabel[actionTabMap[action.type]]}</div>
              <Button variant="outline" size="sm" className="h-8 rounded-md" onClick={() => onOpenAction(action)}>
                Open action
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function WorkspacePanel({
  backupText,
  preview,
  status,
  onBackupTextChange,
  onExport,
  onPreview,
  onRestore,
  onReset,
}: {
  backupText: string;
  preview: WorkspaceSummary | null;
  status: string;
  onBackupTextChange: (value: string) => void;
  onExport: () => void;
  onPreview: () => void;
  onRestore: () => void;
  onReset: (scope: "queue" | "mentors" | "workspace") => void;
}) {
  return (
    <Card className="rounded-md py-5">
      <CardHeader className="px-5">
        <CardTitle className="text-lg">Workspace safety</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-5">
        <Button variant="outline" className="w-full rounded-md" onClick={onExport}>
          Export backup
        </Button>
        <Textarea
          value={backupText}
          onChange={(event) => onBackupTextChange(event.target.value)}
          placeholder="Paste MARO backup JSON to preview or restore"
          className="min-h-28 rounded-md font-mono text-xs"
        />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="rounded-md" onClick={onPreview} disabled={!backupText.trim()}>
            Preview
          </Button>
          <Button className="rounded-md" onClick={onRestore} disabled={!backupText.trim()}>
            Restore
          </Button>
        </div>
        {status ? <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">{status}</div> : null}
        {preview ? <WorkspaceSummaryGrid summary={preview} /> : null}
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          Resets are permanent unless you export a backup first.
        </div>
        <div className="grid gap-2">
          <Button variant="outline" className="rounded-md" onClick={() => onReset("queue")}>
            Reset queue history
          </Button>
          <Button variant="outline" className="rounded-md" onClick={() => onReset("mentors")}>
            Reset mentors
          </Button>
          <Button variant="outline" className="rounded-md border-red-200 text-red-700 hover:bg-red-50 hover:text-red-700" onClick={() => onReset("workspace")}>
            Reset workspace
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WorkspaceSummaryGrid({ summary }: { summary: WorkspaceSummary }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <MiniStat label="Campaigns" value={summary.campaigns} />
      <MiniStat label="Sources" value={summary.sourceRecords} />
      <MiniStat label="Mentors" value={summary.mentors} />
      <MiniStat label="Drafts" value={summary.drafts} />
      <MiniStat label="Invoices" value={summary.invoiceRecords} />
      <MiniStat label="Audit" value={summary.auditEvents} />
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </div>
      <div className="font-mono text-2xl font-semibold">{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-mono text-lg">{value}</div>
    </div>
  );
}

function SafetyLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2">
      <ShieldCheck className="h-4 w-4 text-emerald-600" />
      <span>{text}</span>
    </div>
  );
}

function SensitiveText({
  children,
  privacyMode,
  visible,
  onReveal,
  onHide,
  placeholder,
  className = "",
}: {
  children: React.ReactNode;
  privacyMode: boolean;
  visible: boolean;
  onReveal: () => void;
  onHide: () => void;
  placeholder: string;
  className?: string;
}) {
  if (privacyMode && !visible) {
    return (
      <div className={`rounded-md border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground ${className}`}>
        <div className="flex items-center justify-between gap-3">
          <span>{placeholder}</span>
          <Button type="button" size="sm" variant="outline" className="h-8 rounded-md" onClick={onReveal}>
            <Eye className="h-4 w-4" />
            Reveal
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-md border bg-background p-3 text-sm leading-6 text-muted-foreground ${className}`}>
      <div className="whitespace-pre-wrap">{children}</div>
      {privacyMode ? (
        <Button type="button" size="sm" variant="outline" className="mt-2 h-8 rounded-md" onClick={onHide}>
          <EyeOff className="h-4 w-4" />
          Hide
        </Button>
      ) : null}
    </div>
  );
}

function RuntimeExposurePanel({
  runtimeStatus,
  healthStatus,
  copyStatus,
  onCopyUrl,
}: {
  runtimeStatus: RuntimeStatus | null;
  healthStatus: HealthStatus | null;
  copyStatus: string;
  onCopyUrl: (value: string | null | undefined) => void;
}) {
  const tunnelActive = Boolean(runtimeStatus?.tunnel.active);
  const basicAuth = Boolean(runtimeStatus?.auth.basicAuthConfigured);
  const publicWithoutAuth = Boolean(runtimeStatus?.warnings.includes("ngrok_public_without_basic_auth"));
  const encryptedStorage = Boolean(healthStatus?.storage.encrypted);

  return (
    <Card className="rounded-md py-5">
      <CardHeader className="px-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Runtime exposure</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">Local and ngrok reachability</div>
          </div>
          <Badge
            variant="outline"
            className={tunnelActive ? "rounded-md border-amber-200 bg-amber-50 text-amber-700" : "rounded-md border-emerald-200 bg-emerald-50 text-emerald-700"}
          >
            {tunnelActive ? "Tunnel active" : "Local only"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-5">
        <RuntimeUrlRow
          icon={<Lock className="h-4 w-4" />}
          label="Local URL"
          value={runtimeStatus?.localUrl || "Loading"}
          onCopy={() => onCopyUrl(runtimeStatus?.localUrl)}
        />
        <RuntimeUrlRow
          icon={<Globe2 className="h-4 w-4" />}
          label="Tunnel URL"
          value={runtimeStatus?.tunnel.publicUrl || "Not active"}
          onCopy={() => onCopyUrl(runtimeStatus?.tunnel.publicUrl)}
          disabled={!runtimeStatus?.tunnel.publicUrl}
        />
        <div className="grid grid-cols-2 gap-2 text-sm">
          <MiniStat label="Version" value={runtimeStatus?.version || "Loading"} />
          <MiniStat label="Mode" value={runtimeStatus?.mode || "Loading"} />
          <MiniStat label="Auth" value={basicAuth ? "Basic auth" : "Not set"} />
          <MiniStat label="Ledger" value={encryptedStorage ? "Encrypted" : healthStatus ? "Plain JSON" : "Loading"} />
        </div>
        {copyStatus ? <div className="text-xs text-muted-foreground">{copyStatus}</div> : null}
        {publicWithoutAuth ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
            This ngrok URL is public. Set `NGROK_BASIC_AUTH=user:pass` before sharing sensitive mentor data.
          </div>
        ) : (
          <div className="rounded-md border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
            Browser checks local status only; tunnel metadata is read server-side from the local ngrok inspector when available.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RuntimeUrlRow({
  icon,
  label,
  value,
  onCopy,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onCopy: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border p-2 text-sm">
      <div className="text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate font-mono text-xs">{value}</div>
      </div>
      <Button size="sm" variant="outline" className="h-8 rounded-md" onClick={onCopy} disabled={disabled} aria-label={`Copy ${label}`}>
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}

function MessageQualityBox({ quality }: { quality: CampaignDetails["qualityReviews"][number] }) {
  const tone =
    quality.status === "blocked"
      ? "border-red-200 bg-red-50 text-red-700"
      : quality.status === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-emerald-200 bg-emerald-50 text-emerald-700";
  return (
    <div className="mb-3 rounded-md border bg-muted/20 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium">Message quality</div>
        <Badge variant="outline" className={`rounded-md ${tone}`}>
          {quality.status}
        </Badge>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <MiniStat label="Personal" value={`${quality.metricsJson.personalizationScore}%`} />
        <MiniStat label="Read sec" value={quality.metricsJson.readingTimeSeconds} />
        <MiniStat label="Tokens" value={quality.metricsJson.unresolvedTokenCount} />
      </div>
      {quality.warningsJson.length ? (
        <div className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
          {quality.warningsJson.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-xs text-muted-foreground">No quality issues detected.</div>
      )}
    </div>
  );
}

function ReviewColumn({
  title,
  messages,
  details,
  draftEdits,
  onDraftEdit,
  qualityByMessage,
  handoffStatus,
  privacyMode,
  isSensitiveVisible,
  onRevealSensitive,
  onHideSensitive,
  onCopyDraft,
  onOpenProfile,
  action,
}: {
  title: string;
  messages: CampaignDetails["messages"];
  details: CampaignDetails | null;
  draftEdits: Record<string, Pick<MessageDraft, "subject" | "body">>;
  onDraftEdit: React.Dispatch<React.SetStateAction<Record<string, Pick<MessageDraft, "subject" | "body">>>>;
  qualityByMessage: Map<string, CampaignDetails["qualityReviews"][number]>;
  handoffStatus: Record<string, string>;
  privacyMode: boolean;
  isSensitiveVisible: (key: string) => boolean;
  onRevealSensitive: (key: string) => void;
  onHideSensitive: (key: string) => void;
  onCopyDraft: (message: CampaignDetails["messages"][number]) => void;
  onOpenProfile: (messageId: string, profileUrl: string | null | undefined) => void;
  action: (message: CampaignDetails["messages"][number]) => React.ReactNode;
}) {
  return (
    <Card className="rounded-md py-5">
      <CardHeader className="px-5">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-5">
        {messages.map((message) => {
          const mentor = details?.mentors.find((item) => item.id === message.mentorProfileId);
          const quality = qualityByMessage.get(message.id);
          const sendAttempts = details?.sendAttempts.filter((attempt) => attempt.messageDraftId === message.id) || [];
          const latestSendAttempt = sendAttempts[0] || null;
          const draftBodyKey = `draft-body:${message.id}`;
          const draftBodyVisible = isSensitiveVisible(draftBodyKey);
          return (
            <div key={message.id} className="rounded-md border p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{mentor?.name || "Unknown mentor"}</div>
                  <div className="text-xs text-muted-foreground">{mentor?.headline || "No mentor headline"}</div>
                </div>
                <Badge variant="outline" className="rounded-md">
                  {message.status}
                </Badge>
              </div>
              {latestSendAttempt?.status === "failed" ? (
                <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
                  Last manual send attempt failed: {latestSendAttempt.errorMessage || "No failure reason recorded."}
                </div>
              ) : null}
              {quality ? <MessageQualityBox quality={quality} /> : null}
              <Input
                value={draftEdits[message.id]?.subject ?? message.subject}
                onChange={(event) =>
                  onDraftEdit((current) => ({
                    ...current,
                    [message.id]: {
                      subject: event.target.value,
                      body: current[message.id]?.body ?? message.body,
                    },
                  }))
                }
                className="rounded-md"
              />
              {privacyMode && !draftBodyVisible ? (
                <SensitiveText
                  className="mt-3"
                  privacyMode={privacyMode}
                  visible={false}
                  onReveal={() => onRevealSensitive(draftBodyKey)}
                  onHide={() => onHideSensitive(draftBodyKey)}
                  placeholder="Draft body hidden"
                >
                  {null}
                </SensitiveText>
              ) : (
                <div className="mt-3">
                  <Textarea
                    value={draftEdits[message.id]?.body ?? message.body}
                    onChange={(event) =>
                      onDraftEdit((current) => ({
                        ...current,
                        [message.id]: {
                          subject: current[message.id]?.subject ?? message.subject,
                          body: event.target.value,
                        },
                      }))
                    }
                    className="min-h-48 rounded-md text-sm leading-6"
                  />
                  {privacyMode ? (
                    <Button type="button" size="sm" variant="outline" className="mt-2 h-8 rounded-md" onClick={() => onHideSensitive(draftBodyKey)}>
                      <EyeOff className="h-4 w-4" />
                      Hide draft body
                    </Button>
                  ) : null}
                </div>
              )}
              <div className="mt-3 rounded-md border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Manual profile handoff</div>
                    <div className="text-xs leading-5 text-muted-foreground">
                      Open the source profile and copy the reviewed draft. MARO does not send the message.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-md"
                      onClick={() => onOpenProfile(message.id, mentor?.profileUrl)}
                      disabled={!mentor?.profileUrl}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open profile
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-md"
                      onClick={() => onCopyDraft(message)}
                      disabled={!draftBodyVisible}
                    >
                      <Copy className="h-4 w-4" />
                      Copy draft
                    </Button>
                  </div>
                </div>
                {privacyMode && !draftBodyVisible ? (
                  <div className="mt-2 text-xs text-muted-foreground">Reveal the draft body before copying it for manual handoff.</div>
                ) : null}
                {handoffStatus[message.id] ? <div className="mt-2 text-xs text-muted-foreground">{handoffStatus[message.id]}</div> : null}
              </div>
              <div className="mt-4">{action(message)}</div>
            </div>
          );
        })}
        {!messages.length ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nothing in this queue.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
