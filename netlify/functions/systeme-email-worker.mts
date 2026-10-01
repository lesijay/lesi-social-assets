import { getDeployStore, getStore } from "@netlify/blobs";
import { emailJobs, type EmailJob } from "../../automation/email-jobs";

type WorkerStatus = "pending" | "created" | "scheduled" | "published" | "blocked";

type WorkerState = {
  jobId: string;
  status: WorkerStatus;
  newsletterId?: number;
  scheduledAt?: string;
  publishedAt?: string;
  lastAttemptAt?: string;
  lastError?: string;
  includeTagIds?: number[];
  excludeTagIds?: number[];
  testRecipientReady?: boolean;
  testContactId?: number;
  borrowedTagId?: number;
  borrowedTagName?: string;
  testTagCleaned?: boolean;
};

type Tag = { id: number; name: string };
type Contact = { id: number };

const API_BASE = "https://api.systeme.io";
const STORE_NAME = "hill-systeme-email-worker";

function netlifyGlobal(): any {
  return (globalThis as any).Netlify;
}

function env(name: string): string | undefined {
  return netlifyGlobal()?.env?.get?.(name);
}

function store() {
  const context = netlifyGlobal()?.context?.deploy?.context;
  return context === "production"
    ? getStore(STORE_NAME, { consistency: "strong" })
    : getDeployStore(STORE_NAME);
}

async function systemeFetch(path: string, init: RequestInit = {}) {
  const apiKey = env("SYSTEME_API_KEY");
  if (!apiKey) throw new Error("missing_systeme_api_key");

  const headers = new Headers(init.headers || {});
  headers.set("X-API-Key", apiKey);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await response.text();
  let data: any = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }

  if (!response.ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`systeme_${response.status}:${detail.slice(0, 700)}`);
  }
  return data;
}

async function listTags(): Promise<Tag[]> {
  const tags: Tag[] = [];
  let startingAfter: number | undefined;

  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ limit: "100", order: "asc" });
    if (startingAfter) params.set("startingAfter", String(startingAfter));
    const data = await systemeFetch(`/api/tags?${params.toString()}`);
    const items: Tag[] = Array.isArray(data?.items) ? data.items : [];
    tags.push(...items);
    if (!data?.hasMore || items.length === 0) break;
    startingAfter = items[items.length - 1].id;
  }

  return tags;
}

async function createTag(name: string): Promise<Tag> {
  const data = await systemeFetch("/api/tags", {
    method: "POST",
    body: JSON.stringify({ name })
  });
  if (!Number.isInteger(data?.id)) throw new Error(`create_tag_missing_id:${name}`);
  return { id: data.id, name: data.name ?? name };
}

async function findEmptyTag(tags: Tag[]): Promise<Tag> {
  for (const tag of tags) {
    const params = new URLSearchParams({ tags: String(tag.id), limit: "10", order: "asc" });
    const data = await systemeFetch(`/api/contacts?${params.toString()}`);
    const items: Contact[] = Array.isArray(data?.items) ? data.items : [];
    if (items.length === 0) return tag;
  }
  throw new Error("no_empty_tag_available_for_test");
}

async function resolveIncludeTagIds(job: EmailJob, tags: Tag[]): Promise<number[]> {
  const ids: number[] = [];
  for (const name of job.includeTagNames) {
    let match = tags.find((tag) => tag.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (!match && job.createMissingIncludeTags) {
      match = await createTag(name);
      tags.push(match);
    }
    if (!match) throw new Error(`missing_tag:${name}`);
    ids.push(match.id);
  }
  return ids;
}

function resolveTagIds(names: string[], tags: Tag[]): number[] {
  return names.map((name) => {
    const match = tags.find((tag) => tag.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (!match) throw new Error(`missing_tag:${name}`);
    return match.id;
  });
}

async function findOrCreateContact(email: string): Promise<number> {
  const params = new URLSearchParams({ email, limit: "10" });
  const data = await systemeFetch(`/api/contacts?${params.toString()}`);
  const items: Contact[] = Array.isArray(data?.items) ? data.items : [];
  if (items.length > 1) throw new Error(`multiple_contacts_for_test_email:${email}`);
  if (items.length === 1 && Number.isInteger(items[0]?.id)) return items[0].id;

  const created = await systemeFetch("/api/contacts", {
    method: "POST",
    body: JSON.stringify({ email })
  });
  if (!Number.isInteger(created?.id)) throw new Error(`create_contact_missing_id:${email}`);
  return created.id;
}

async function assignTagToContact(contactId: number, tagId: number) {
  await systemeFetch(`/api/contacts/${contactId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tagId })
  });
}

async function removeTagFromContact(contactId: number, tagId: number) {
  await systemeFetch(`/api/contacts/${contactId}/tags/${tagId}`, {
    method: "DELETE"
  });
}

async function ensureTestRecipient(job: EmailJob, includeTagIds: number[]): Promise<number | undefined> {
  if (!job.testRecipientEmail) return undefined;
  if (includeTagIds.length !== 1) throw new Error("test_job_requires_exactly_one_include_tag");
  const contactId = await findOrCreateContact(job.testRecipientEmail);
  await assignTagToContact(contactId, includeTagIds[0]);
  return contactId;
}

async function saveState(state: WorkerState) {
  await store().setJSON(`jobs/${state.jobId}`, state);
}

async function loadState(jobId: string): Promise<WorkerState> {
  const current = await store().get(`jobs/${jobId}`, { type: "json" });
  return current || { jobId, status: "pending" };
}

async function createNewsletter(job: EmailJob): Promise<number> {
  const payload = {
    content: {
      subject: job.subject,
      previewText: job.previewText ?? null,
      editorType: "classic",
      bodyHtml: job.bodyHtml,
      senderEmail: job.senderEmail ?? null,
      senderName: job.senderName ?? null
    }
  };

  const data = await systemeFetch("/api/mailing/newsletters", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  if (!Number.isInteger(data?.id)) throw new Error("create_newsletter_missing_id");
  return data.id;
}

async function setAudience(newsletterId: number, includeTagIds: number[], excludeTagIds: number[]) {
  await systemeFetch(`/api/mailing/newsletters/${newsletterId}/included-tags`, {
    method: "PUT",
    body: JSON.stringify({ tagIds: includeTagIds })
  });

  await systemeFetch(`/api/mailing/newsletters/${newsletterId}/excluded-tags`, {
    method: "PUT",
    body: JSON.stringify({ tagIds: excludeTagIds })
  });
}

async function scheduleNewsletter(newsletterId: number, sendAt: string) {
  await systemeFetch(`/api/mailing/newsletters/${newsletterId}/schedule`, {
    method: "PUT",
    body: JSON.stringify({ scheduledAt: sendAt })
  });
}

async function verifySent(newsletterId: number): Promise<boolean> {
  const data = await systemeFetch(`/api/mailing/newsletters/${newsletterId}`);
  return data?.state?.isSent === true;
}

async function cleanupBorrowedTag(state: WorkerState) {
  if (state.testTagCleaned || !state.borrowedTagId || !state.testContactId) return;
  await removeTagFromContact(state.testContactId, state.borrowedTagId);
  state.testTagCleaned = true;
}

async function processJob(job: EmailJob, now: Date) {
  if (!job.enabled || !job.approved) return;

  const sendAt = new Date(job.sendAt);
  if (Number.isNaN(sendAt.getTime())) throw new Error(`invalid_send_at:${job.id}`);

  let state = await loadState(job.id);

  if (state.status === "published") {
    if (state.borrowedTagId && state.testContactId && !state.testTagCleaned) {
      try {
        await cleanupBorrowedTag(state);
        state.lastError = undefined;
        await saveState(state);
      } catch (error) {
        state.lastError = `cleanup_failed:${error instanceof Error ? error.message : String(error)}`;
        await saveState(state);
      }
    }
    return;
  }

  const nowIso = now.toISOString();
  state.lastAttemptAt = nowIso;

  if (state.status === "scheduled" && state.newsletterId) {
    if (now.getTime() >= sendAt.getTime() + 2 * 60 * 1000) {
      const sent = await verifySent(state.newsletterId);
      if (sent) {
        state.status = "published";
        state.publishedAt = nowIso;
        state.lastError = undefined;
        try {
          await cleanupBorrowedTag(state);
        } catch (error) {
          state.lastError = `cleanup_failed:${error instanceof Error ? error.message : String(error)}`;
        }
        await saveState(state);
      } else {
        await saveState(state);
      }
    }
    return;
  }

  const leadMinutes = job.scheduleLeadMinutes ?? 360;
  const opensAt = sendAt.getTime() - leadMinutes * 60 * 1000;
  if (now.getTime() < opensAt) return;

  if (now.getTime() >= sendAt.getTime() - 2 * 60 * 1000) {
    state.status = "blocked";
    state.lastError = "missed_safe_schedule_window";
    await saveState(state);
    return;
  }

  try {
    if (!state.includeTagIds || !state.excludeTagIds) {
      const tags = await listTags();
      if (job.reuseEmptyIncludeTagForTest) {
        const borrowed = await findEmptyTag(tags);
        state.includeTagIds = [borrowed.id];
        state.borrowedTagId = borrowed.id;
        state.borrowedTagName = borrowed.name;
        state.testTagCleaned = false;
      } else {
        state.includeTagIds = await resolveIncludeTagIds(job, tags);
      }
      state.excludeTagIds = resolveTagIds(job.excludeTagNames ?? [], tags);
      await saveState(state);
    }

    if (job.testRecipientEmail && !state.testRecipientReady) {
      state.testContactId = await ensureTestRecipient(job, state.includeTagIds ?? []);
      state.testRecipientReady = true;
      await saveState(state);
    }

    if (!state.newsletterId) {
      state.newsletterId = await createNewsletter(job);
      state.status = "created";
      state.lastError = undefined;
      await saveState(state);
    }

    await setAudience(state.newsletterId, state.includeTagIds ?? [], state.excludeTagIds ?? []);
    await scheduleNewsletter(state.newsletterId, job.sendAt);

    state.status = "scheduled";
    state.scheduledAt = nowIso;
    state.lastError = undefined;
    await saveState(state);
  } catch (error) {
    state.status = "blocked";
    state.lastError = error instanceof Error ? error.message : String(error);
    await saveState(state);
  }
}

export default async () => {
  const now = new Date();

  if (!env("SYSTEME_API_KEY")) {
    console.log(JSON.stringify({ worker: "systeme-email", status: "blocked", reason: "missing_systeme_api_key" }));
    return;
  }

  for (const job of emailJobs) {
    try {
      await processJob(job, now);
    } catch (error) {
      console.error(JSON.stringify({
        worker: "systeme-email",
        jobId: job.id,
        status: "error",
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }
};

export const config = {
  schedule: "*/5 * * * *"
};
