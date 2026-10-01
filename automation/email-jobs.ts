import manifest from "./email-jobs.json";

export type EmailJob = {
  id: string;
  sourceDistributionId?: string;
  sourceQueue?: string;
  enabled: boolean;
  approved: boolean;
  sendAt: string;
  subject: string;
  previewText?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  senderEmail?: string | null;
  senderName?: string | null;
  includeTagNames: string[];
  excludeTagNames?: string[];
  scheduleLeadMinutes?: number;
  createMissingIncludeTags?: boolean;
  reuseEmptyIncludeTagForTest?: boolean;
  testRecipientEmail?: string;
};

export const emailJobs = manifest.jobs as EmailJob[];
