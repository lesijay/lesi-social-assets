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
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["true", "yes", "1", "enabled", "approved"].includes(normalized);
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).map((v) => v.trim()).filter(Boolean);
  } catch {
    // Fall through to comma-separated parsing.
  }
  return raw.split(",").map((v) => v.trim()).filter(Boolean);
}

function normalizeJob(raw: Record<string, unknown>): EmailJob {
  const bodyText = String(raw.bodyText ?? "");
  const bodyHtml = String(raw.bodyHtml ?? "").trim() || bodyTextToHtml(bodyText);
  const lead = Number(raw.scheduleLeadMinutes ?? 360);
  return {
    id: String(raw.id ?? "").trim(),
    sourceDistributionId: String(raw.sourceDistributionId ?? "").trim() || undefined,
    sourceQueue: String(raw.sourceQueue ?? "").trim() || undefined,
    enabled: parseBoolean(raw.enabled),
    approved: parseBoolean(raw.approved),
    sendAt: String(raw.sendAt ?? "").trim(),
    subject: String(raw.subject ?? "").trim(),
    previewText: String(raw.previewText ?? "").trim() || null,
    bodyText,
    bodyHtml,
    senderEmail: String(raw.senderEmail ?? "").trim() || null,
    senderName: String(raw.senderName ?? "").trim() || null,
    includeTagNames: parseTags(raw.includeTagNames),
    excludeTagNames: parseTags(raw.excludeTagNames),
    scheduleLeadMinutes: Number.isFinite(lead) && lead > 0 ? lead : 360,
    createMissingIncludeTags: parseBoolean(raw.createMissingIncludeTags),
    reuseEmptyIncludeTagForTest: parseBoolean(raw.reuseEmptyIncludeTagForTest),
    testRecipientEmail: String(raw.testRecipientEmail ?? "").trim() || undefined
  };
}

function parseGvizResponse(text: string): Record<string, unknown>[] {
  const marker = "google.visualization.Query.setResponse(";
  const start = text.indexOf(marker);
  const end = text.lastIndexOf(");");
  if (start < 0 || end < 0 || end <= start) throw new Error("dispatch_feed_invalid_gviz_response");

  const payload = JSON.parse(text.slice(start + marker.length, end));
  if (payload?.status === "error") throw new Error(`dispatch_feed_gviz_error:${JSON.stringify(payload.errors ?? [])}`);

  const columns = Array.isArray(payload?.table?.cols) ? payload.table.cols : [];
  const headers = columns.map((column: any) => String(column?.label ?? "").trim());
  const rows = Array.isArray(payload?.table?.rows) ? payload.table.rows : [];

  return rows.map((row: any) => {
    const cells = Array.isArray(row?.c) ? row.c : [];
    const record: Record<string, unknown> = {};
    headers.forEach((header: string, index: number) => {
      if (!header) return;
      const cell = cells[index];
      record[header] = cell?.v ?? "";
    });
    return record;
  });
}

function parseJsonFeed(text: string): Record<string, unknown>[] {
  const payload = JSON.parse(text);
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (Array.isArray(payload?.jobs)) return payload.jobs as Record<string, unknown>[];
  throw new Error("dispatch_feed_invalid_json_shape");
}

const fallbackJobs = (manifest.jobs as Record<string, unknown>[]).map(normalizeJob);

export async function loadEmailJobs(feedUrl?: string): Promise<EmailJob[]> {
  if (!feedUrl) return fallbackJobs;

  const separator = feedUrl.includes("?") ? "&" : "?";
  const response = await fetch(`${feedUrl}${separator}_=${Date.now()}`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache, no-store, max-age=0",
      "User-Agent": "LitLambs-Systeme-Email-Worker/1.0"
    }
  });
  if (!response.ok) throw new Error(`dispatch_feed_${response.status}`);

  const text = await response.text();
  const trimmed = text.trim();
  const rows = trimmed.startsWith("{") || trimmed.startsWith("[")
    ? parseJsonFeed(trimmed)
    : parseGvizResponse(text);

  return rows
    .filter((row) => String(row.id ?? "").trim())
    .map(normalizeJob);
}
