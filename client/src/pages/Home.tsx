import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  ClipboardCheck,
  Copy,
  Euro,
  ExternalLink,
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
  type LedgerSummary,
  type MessageDraft,
  type MentorImportResult,
  type MentorProfile,
  type MentorResponse,
  type NextActionRecommendation,
  type OutreachOutcome,
  type RuntimeStatus,
  type UsageReport,
  type WorkspaceSummary,
  ledgerApi,
} from "@/lib/ledgerApi";

type CampaignForm = {
  title: string;
  goal: string;
  targetMentorType: string;
  source: string;
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

const defaultCampaignForm: CampaignForm = {
  title: "",
  goal: "",
  targetMentorType: "Startup, operations, product, growth, or automation mentor",
  source: "MicroMentor/manual",
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
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState("");
  const [details, setDetails] = useState<CampaignDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [campaignForm, setCampaignForm] = useState<CampaignForm>(defaultCampaignForm);
  const [mentorForm, setMentorForm] = useState<MentorForm>(defaultMentorForm);
  const [sendEvidence, setSendEvidence] = useState<Record<string, string>>({});
  const [responseText, setResponseText] = useState<Record<string, string>>({});
  const [responseClass, setResponseClass] = useState<Record<string, MentorResponse["classification"]>>({});
  const [draftEdits, setDraftEdits] = useState<Record<string, Pick<MessageDraft, "subject" | "body">>>({});
  const [mentorEdits, setMentorEdits] = useState<Record<string, { notes: string; stage: MentorProfile["stage"] }>>({});
  const [outcomeText, setOutcomeText] = useState<Record<string, string>>({});
  const [outcomeStatus, setOutcomeStatus] = useState<Record<string, OutreachOutcome["status"]>>({});
  const [usageReport, setUsageReport] = useState<UsageReport | null>(null);
  const [csvText, setCsvText] = useState(sampleCsv);
  const [csvImportResult, setCsvImportResult] = useState<MentorImportResult | null>(null);
  const [selectedMentorId, setSelectedMentorId] = useState("");
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [runtimeCopyStatus, setRuntimeCopyStatus] = useState("");
  const [workspaceBackupText, setWorkspaceBackupText] = useState("");
  const [workspacePreview, setWorkspacePreview] = useState<WorkspaceSummary | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState("");

  const loadLedger = async (campaignId?: string) => {
    setLoading(true);
    setError("");
    try {
      const [nextSummary, campaignResult, nextRuntimeStatus] = await Promise.all([
        ledgerApi.summary(),
        ledgerApi.campaigns(),
        ledgerApi.runtimeStatus().catch(() => null),
      ]);
      const nextCampaigns = campaignResult.campaigns;
      const selectedId = campaignId !== undefined ? campaignId || latestCampaign(nextCampaigns)?.id || "" : activeCampaignId || latestCampaign(nextCampaigns)?.id || "";
      const nextDetails = selectedId ? await ledgerApi.campaign(selectedId) : null;
      setSummary(nextSummary);
      setCampaigns(nextCampaigns);
      setActiveCampaignId(selectedId);
      setDetails(nextDetails);
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

  const campaign = details?.campaign || null;
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

  const createCampaign = () =>
    mutate(async () => {
      const result = await ledgerApi.createCampaign(campaignForm);
      setCampaignForm(defaultCampaignForm);
      setActiveCampaignId(result.campaign.id);
      await loadLedger(result.campaign.id);
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
      const result = await ledgerApi.importMentorCsv(activeCampaignId, csvText, preview);
      setCsvImportResult(result);
    });

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

  const dueFollowUps = (details?.followUps || []).filter(
    (followUp) => followUp.status === "scheduled" && new Date(followUp.dueAt).getTime() <= Date.now()
  );
  const latestResourceSession = details?.resourceSessions[0] || null;
  const publicTunnelWithoutAuth = Boolean(runtimeStatus?.warnings.includes("ngrok_public_without_basic_auth"));
  const copyRuntimeUrl = async (value: string | null | undefined) => {
    if (!value) return;
    try {
      await navigator.clipboard?.writeText(value);
      setRuntimeCopyStatus("URL copied.");
    } catch {
      setRuntimeCopyStatus("Clipboard blocked. Select the URL text manually.");
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
          <div className="hidden items-center gap-2 md:flex">
            <Badge variant="outline" className="rounded-md border-emerald-200 bg-emerald-50 text-emerald-700">
              Persisted local API
            </Badge>
            <Button variant="outline" className="rounded-md" onClick={() => void loadLedger(activeCampaignId)}>
              <RefreshCcw className="h-4 w-4" />
              Refresh
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
              <NextActionPanel actions={nextActions.slice(0, 5)} />
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
                </div>
                {campaign ? (
                  <select
                    value={campaign.status}
                    onChange={(event) => void mutate(() => ledgerApi.updateCampaign(campaign.id, { status: event.target.value as Campaign["status"] }))}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                ) : null}
                <Progress value={progress} className="h-2 rounded-md bg-muted" />
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <MiniStat label="Drafted" value={campaign?.messagesDrafted || 0} />
                  <MiniStat label="Sent" value={campaign?.messagesSent || 0} />
                  <MiniStat label="Replies" value={campaign?.responsesReceived || 0} />
                </div>
              </CardContent>
            </Card>

            <RuntimeExposurePanel runtimeStatus={runtimeStatus} copyStatus={runtimeCopyStatus} onCopyUrl={copyRuntimeUrl} />
          </div>
        </section>

        <Tabs defaultValue="ledger" className="mt-5 gap-4">
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
                            <div className="text-xs text-muted-foreground">{item.source}</div>
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

            <Card className="rounded-md py-5">
              <CardHeader className="px-5">
                <CardTitle className="text-lg">New campaign</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-5">
                <Input value={campaignForm.title} onChange={(event) => setCampaignForm((current) => ({ ...current, title: event.target.value }))} placeholder="Campaign title" className="rounded-md" />
                <Textarea value={campaignForm.goal} onChange={(event) => setCampaignForm((current) => ({ ...current, goal: event.target.value }))} placeholder="Outreach goal" className="min-h-24 rounded-md" />
                <Input value={campaignForm.targetMentorType} onChange={(event) => setCampaignForm((current) => ({ ...current, targetMentorType: event.target.value }))} placeholder="Target mentor type" className="rounded-md" />
                <Input value={campaignForm.source} onChange={(event) => setCampaignForm((current) => ({ ...current, source: event.target.value }))} placeholder="Source" className="rounded-md" />
                <Button className="w-full rounded-md" onClick={() => void createCampaign()} disabled={!campaignForm.title.trim() || !campaignForm.goal.trim()}>
                  <Plus className="h-4 w-4" />
                  Create campaign
                </Button>
              </CardContent>
            </Card>
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
                            <div className="mt-3 grid gap-2 md:grid-cols-[180px_1fr_auto]">
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
              onCreateDraft={(mentor) => void mutate(() => ledgerApi.createDraft(activeCampaignId, mentor.id))}
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
                <Textarea
                  value={csvText}
                  onChange={(event) => setCsvText(event.target.value)}
                  className="min-h-40 rounded-md font-mono text-xs"
                  placeholder="name,company,headline,bio,skills,profileUrl,notes"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" className="rounded-md" onClick={() => void importMentorCsv(true)} disabled={!csvText.trim() || !activeCampaignId}>
                    Preview
                  </Button>
                  <Button className="rounded-md" onClick={() => void importMentorCsv(false)} disabled={!csvText.trim() || !activeCampaignId}>
                    Import
                  </Button>
                </div>
                <Button variant="outline" className="w-full rounded-md" onClick={() => void exportMentorCsv()} disabled={!activeCampaignId}>
                  Export mentors CSV
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
              action={(message) => (
                <div className="space-y-2">
                  <Input
                    value={sendEvidence[message.id] || ""}
                    onChange={(event) => setSendEvidence((current) => ({ ...current, [message.id]: event.target.value }))}
                    placeholder="Paste manual send evidence"
                    className="rounded-md"
                  />
                  <Button
                    className="w-full rounded-md"
                    onClick={() => void mutate(() => ledgerApi.confirmSend(message.id, sendEvidence[message.id] || ""))}
                    disabled={!sendEvidence[message.id]?.trim()}
                  >
                    <Send className="h-4 w-4" />
                    Confirm manually sent
                  </Button>
                </div>
              )}
            />
          </TabsContent>

          <TabsContent value="responses" className="grid gap-4 xl:grid-cols-[1fr_420px]">
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
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{response.body || "No response text recorded."}</p>
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
          </TabsContent>

          <TabsContent value="billing" className="grid gap-4 lg:grid-cols-[1fr_420px]">
            <Card className="rounded-md py-5">
              <CardHeader className="px-5">
                <CardTitle className="text-lg">Follow-up queue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-5">
                {(details?.followUps || []).map((followUp) => {
                  const mentor = details?.mentors.find((item) => item.id === followUp.mentorProfileId);
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
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{followUp.suggestedMessage}</p>
                      {followUp.status === "scheduled" ? (
                        <div className="mt-3 flex flex-wrap gap-2">
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
  onCreateDraft,
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
  onCreateDraft: (mentor: MentorProfile) => void;
}) {
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
                        <div className="mt-2 text-xs leading-5 text-muted-foreground">
                          Send proof: {attempts.map((attempt) => attempt.deliveryEvidence || attempt.status).join("; ")}
                        </div>
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
                    {response.classification.replace("_", " ")}: {response.body || "No response text recorded."}
                  </div>
                ))}
                {followUps.map((followUp) => (
                  <div key={followUp.id} className="rounded-md bg-muted/30 p-2">
                    Follow-up {followUp.status}, due {formatDate(followUp.dueAt)}: {followUp.suggestedMessage}
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
              <div className="text-xs leading-5 text-muted-foreground">{mentor.notes || "No internal notes recorded."}</div>
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

function NextActionPanel({ actions }: { actions: NextActionRecommendation[] }) {
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
      <ActionList actions={actions} emptyText="No immediate action. Add mentors, draft outreach, or record responses to create the next operating step." />
    </div>
  );
}

function ActionList({ actions, emptyText }: { actions: NextActionRecommendation[]; emptyText: string }) {
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
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-lg">{value}</div>
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

function RuntimeExposurePanel({
  runtimeStatus,
  copyStatus,
  onCopyUrl,
}: {
  runtimeStatus: RuntimeStatus | null;
  copyStatus: string;
  onCopyUrl: (value: string | null | undefined) => void;
}) {
  const tunnelActive = Boolean(runtimeStatus?.tunnel.active);
  const basicAuth = Boolean(runtimeStatus?.auth.basicAuthConfigured);
  const publicWithoutAuth = Boolean(runtimeStatus?.warnings.includes("ngrok_public_without_basic_auth"));

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
          <MiniStat label="Mode" value={runtimeStatus?.mode || "Loading"} />
          <MiniStat label="Auth" value={basicAuth ? "Basic auth" : "Not set"} />
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
  action,
}: {
  title: string;
  messages: CampaignDetails["messages"];
  details: CampaignDetails | null;
  draftEdits: Record<string, Pick<MessageDraft, "subject" | "body">>;
  onDraftEdit: React.Dispatch<React.SetStateAction<Record<string, Pick<MessageDraft, "subject" | "body">>>>;
  qualityByMessage: Map<string, CampaignDetails["qualityReviews"][number]>;
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
                className="mt-3 min-h-48 rounded-md text-sm leading-6"
              />
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
