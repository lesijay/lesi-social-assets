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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bodyTextToHtml(value: string): string {
  return value
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

export const emailJobs = (manifest.jobs as EmailJob[]).map((job) => ({
  ...job,
  bodyHtml: job.bodyHtml ?? bodyTextToHtml(job.bodyText ?? "")
}));
