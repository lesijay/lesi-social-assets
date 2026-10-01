export type EmailJob = {
  id: string;
  enabled: boolean;
  approved: boolean;
  sendAt: string;
  subject: string;
  previewText?: string | null;
  bodyHtml: string;
  senderEmail?: string | null;
  senderName?: string | null;
  includeTagNames: string[];
  excludeTagNames?: string[];
  scheduleLeadMinutes?: number;
  createMissingIncludeTags?: boolean;
  reuseEmptyIncludeTagForTest?: boolean;
  testRecipientEmail?: string;
};

export const emailJobs: EmailJob[] = [
  {
    id: "LL-TEST-001",
    enabled: true,
    approved: true,
    sendAt: "2026-10-01T08:40:00Z",
    subject: "Hill email automation test",
    previewText: "Automated publishing route test",
    bodyHtml: "<p>This is a controlled test of the Lit Lambs unattended email publishing workflow.</p><p>If you received this, the Systeme.io API worker successfully created the newsletter, isolated the test audience, scheduled the send and allowed Systeme.io to deliver it automatically.</p>",
    senderEmail: "lesi@litlambs.org",
    senderName: "Lesi Sampson",
    includeTagNames: [],
    excludeTagNames: [],
    scheduleLeadMinutes: 360,
    reuseEmptyIncludeTagForTest: true,
    testRecipientEmail: "lesi@litlambs.org"
  }
];
