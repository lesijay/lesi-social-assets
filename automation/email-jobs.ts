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
};

export const emailJobs: EmailJob[] = [
  {
    id: "LL-TEST-001",
    enabled: false,
    approved: false,
    sendAt: "2099-01-01T09:00:00Z",
    subject: "Hill email automation test",
    previewText: "Automated publishing route test",
    bodyHtml: "<p>This is a controlled test of the Lit Lambs unattended email publishing workflow.</p>",
    senderEmail: "lesi@litlambs.org",
    senderName: "Lesi Sampson",
    includeTagNames: ["HILL TEST"],
    excludeTagNames: [],
    scheduleLeadMinutes: 360
  }
];
