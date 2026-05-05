export type MentorProfile = {
  id?: string;
  name: string;
  title?: string;
  organization?: string;
  country?: string;
  expertise?: string[];
  industries?: string[];
  languages?: string[];
  goals?: string[];
  profileUrl?: string;
  lastContactedAt?: string;
  unavailable?: boolean;
};

export type UserOutreachProfile = {
  name: string;
  ventureSummary: string;
  goals: string[];
  preferredIndustries?: string[];
  desiredExpertise?: string[];
  languages?: string[];
  location?: string;
  maxDailyMessages?: number;
  followUpDays?: number[];
};

export type OutreachTemplate = {
  subject: string;
  opening: string;
  problemStatement: string;
  ask: string;
  closing: string;
};

export type ScoredMentor = {
  mentor: MentorProfile;
  score: number;
  reasons: string[];
  risks: string[];
};

export type PlannedOutreachMessage = {
  mentorId: string;
  mentorName: string;
  mentorUrl?: string;
  subject: string;
  body: string;
  score: number;
  reasons: string[];
  scheduledAt: string;
  followUpDates: string[];
};

export type CampaignPlan = {
  createdAt: string;
  dailyLimit: number;
  totalMentors: number;
  selectedCount: number;
  rejectedCount: number;
  messages: PlannedOutreachMessage[];
  rejected: ScoredMentor[];
  summary: {
    averageScore: number;
    strongestReason: string | null;
    nextAction: string;
  };
};

const DEFAULT_DAILY_LIMIT = 20;
const DEFAULT_MIN_SCORE = 40;
const DEFAULT_FOLLOW_UP_DAYS = [3, 7, 14];

export const defaultOutreachTemplate: OutreachTemplate = {
  subject: "MicroMentor request: practical guidance for {{ventureSummaryShort}}",
  opening: "Hello {{mentorName}},",
  problemStatement:
    "I am working on {{ventureSummary}}. I am looking for practical guidance from someone with experience in {{matchedExpertise}}.",
  ask:
    "Would you be open to sharing advice on {{primaryGoal}}? A short written answer or a brief mentor conversation would already be valuable.",
  closing: "Kind regards,\n{{userName}}",
};

function normalizeList(values: string[] | undefined): string[] {
  return (values ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function overlap(left: string[] | undefined, right: string[] | undefined): string[] {
  const leftSet = new Set(normalizeList(left));
  return unique(normalizeList(right).filter((value) => leftSet.has(value)));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function safeId(mentor: MentorProfile, index: number): string {
  if (mentor.id?.trim()) return mentor.id.trim();
  return mentor.profileUrl?.trim() || `${mentor.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index + 1}`;
}

function shortText(value: string, maxLength = 42): string {
  const trimmed = value.trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength - 1).trim()}…`;
}

function addDays(startDate: Date, days: number): string {
  const date = new Date(startDate);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function scheduledDate(startDate: Date, index: number, dailyLimit: number): string {
  const dayOffset = Math.floor(index / dailyLimit);
  return addDays(startDate, dayOffset);
}

function renderTemplatePart(templatePart: string, replacements: Record<string, string>): string {
  return templatePart.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => replacements[key] ?? "");
}

export function scoreMentor(mentor: MentorProfile, user: UserOutreachProfile): ScoredMentor {
  const reasons: string[] = [];
  const risks: string[] = [];
  let score = 0;

  const expertiseMatches = overlap(mentor.expertise, user.desiredExpertise);
  if (expertiseMatches.length > 0) {
    score += Math.min(35, expertiseMatches.length * 14);
    reasons.push(`Expertise match: ${expertiseMatches.join(", ")}`);
  }

  const industryMatches = overlap(mentor.industries, user.preferredIndustries);
  if (industryMatches.length > 0) {
    score += Math.min(25, industryMatches.length * 12);
    reasons.push(`Industry match: ${industryMatches.join(", ")}`);
  }

  const languageMatches = overlap(mentor.languages, user.languages);
  if (languageMatches.length > 0) {
    score += Math.min(15, languageMatches.length * 8);
    reasons.push(`Language match: ${languageMatches.join(", ")}`);
  }

  const goalMatches = overlap(mentor.goals, user.goals);
  if (goalMatches.length > 0) {
    score += Math.min(15, goalMatches.length * 8);
    reasons.push(`Goal match: ${goalMatches.join(", ")}`);
  }

  if (mentor.country && user.location && mentor.country.toLowerCase() === user.location.toLowerCase()) {
    score += 10;
    reasons.push(`Location match: ${mentor.country}`);
  }

  if (mentor.unavailable) {
    score -= 50;
    risks.push("Mentor is marked as unavailable.");
  }

  if (mentor.lastContactedAt) {
    const lastContacted = new Date(mentor.lastContactedAt);
    const daysSinceContact = Number.isFinite(lastContacted.getTime())
      ? (Date.now() - lastContacted.getTime()) / 86_400_000
      : Number.POSITIVE_INFINITY;

    if (daysSinceContact < 30) {
      score -= 30;
      risks.push("Mentor was contacted within the last 30 days.");
    }
  }

  if (reasons.length === 0) {
    risks.push("No clear match with the current outreach profile.");
  }

  return {
    mentor,
    score: clampScore(score),
    reasons,
    risks,
  };
}

export function buildOutreachMessage(
  scoredMentor: ScoredMentor,
  user: UserOutreachProfile,
  index: number,
  startDate: Date,
  dailyLimit: number,
  template: OutreachTemplate = defaultOutreachTemplate,
): PlannedOutreachMessage {
  const mentor = scoredMentor.mentor;
  const expertiseMatches = overlap(mentor.expertise, user.desiredExpertise);
  const replacements = {
    userName: user.name,
    mentorName: mentor.name,
    ventureSummary: user.ventureSummary,
    ventureSummaryShort: shortText(user.ventureSummary),
    primaryGoal: user.goals[0] ?? "building the next step",
    matchedExpertise: expertiseMatches[0] ?? user.desiredExpertise?.[0] ?? "entrepreneurship",
  };

  const scheduledAt = scheduledDate(startDate, index, dailyLimit);
  const followUpDates = (user.followUpDays ?? DEFAULT_FOLLOW_UP_DAYS).map((days) => addDays(new Date(scheduledAt), days));

  return {
    mentorId: safeId(mentor, index),
    mentorName: mentor.name,
    mentorUrl: mentor.profileUrl,
    subject: renderTemplatePart(template.subject, replacements),
    body: [
      renderTemplatePart(template.opening, replacements),
      "",
      renderTemplatePart(template.problemStatement, replacements),
      "",
      renderTemplatePart(template.ask, replacements),
      "",
      renderTemplatePart(template.closing, replacements),
    ].join("\n"),
    score: scoredMentor.score,
    reasons: scoredMentor.reasons,
    scheduledAt,
    followUpDates,
  };
}

export function buildCampaignPlan(options: {
  mentors: MentorProfile[];
  user: UserOutreachProfile;
  template?: OutreachTemplate;
  startDate?: string | Date;
  minScore?: number;
  dailyLimit?: number;
  includeUnavailable?: boolean;
}): CampaignPlan {
  const startDate = options.startDate ? new Date(options.startDate) : new Date();
  if (!Number.isFinite(startDate.getTime())) {
    throw new Error("Invalid startDate supplied to buildCampaignPlan.");
  }

  const dailyLimit = Math.max(1, options.dailyLimit ?? options.user.maxDailyMessages ?? DEFAULT_DAILY_LIMIT);
  const minScore = options.minScore ?? DEFAULT_MIN_SCORE;

  const scored = options.mentors.map((mentor) => scoreMentor(mentor, options.user));
  const selected = scored
    .filter((item) => item.score >= minScore)
    .filter((item) => options.includeUnavailable || !item.mentor.unavailable)
    .sort((left, right) => right.score - left.score || left.mentor.name.localeCompare(right.mentor.name));

  const rejected = scored.filter((item) => !selected.includes(item));

  const messages = selected.map((item, index) =>
    buildOutreachMessage(item, options.user, index, startDate, dailyLimit, options.template),
  );

  const averageScore = messages.length
    ? Math.round(messages.reduce((total, message) => total + message.score, 0) / messages.length)
    : 0;

  const strongestReason = messages
    .flatMap((message) => message.reasons)
    .reduce<Record<string, number>>((counts, reason) => {
      counts[reason] = (counts[reason] ?? 0) + 1;
      return counts;
    }, {});

  const mostCommonReason = Object.entries(strongestReason).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    createdAt: new Date().toISOString(),
    dailyLimit,
    totalMentors: options.mentors.length,
    selectedCount: selected.length,
    rejectedCount: rejected.length,
    messages,
    rejected,
    summary: {
      averageScore,
      strongestReason: mostCommonReason,
      nextAction:
        messages.length > 0
          ? "Review the generated messages, approve the queue, then send through the user's own MicroMentor account."
          : "Add more mentor data or lower minScore after manual review.",
    },
  };
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportCampaignCsv(plan: CampaignPlan): string {
  const headers = [
    "mentorId",
    "mentorName",
    "score",
    "scheduledAt",
    "followUpDates",
    "subject",
    "body",
    "mentorUrl",
    "reasons",
  ];

  const rows = plan.messages.map((message) => [
    message.mentorId,
    message.mentorName,
    message.score,
    message.scheduledAt,
    message.followUpDates.join(" | "),
    message.subject,
    message.body,
    message.mentorUrl ?? "",
    message.reasons.join(" | "),
  ]);

  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}
