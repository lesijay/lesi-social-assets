import fs from "node:fs";

const API_BASE = "https://api.systeme.io";
const MANIFEST_PATH = "automation/email-jobs.json";
const apiKey = process.env.SYSTEME_API_KEY;

if (!apiKey) {
  console.error("SYSTEME_API_KEY is not configured.");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const jobs = Array.isArray(manifest.jobs) ? manifest.jobs : [];
const now = new Date();
let changed = false;

async function systemeFetch(path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("X-API-Key", apiKey);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!response.ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`systeme_${response.status}:${detail.slice(0, 700)}`);
  }
  return data;
}

try {
  await systemeFetch("/api/tags?limit=10&order=asc");
  console.log("Systeme API authentication verified.");
} catch (error) {
  console.error(`Systeme API authentication failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

async function listTags() {
  const tags = [];
  let startingAfter;
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ limit: "100", order: "asc" });
    if (startingAfter) params.set("startingAfter", String(startingAfter));
    const data = await systemeFetch(`/api/tags?${params.toString()}`);
    const items = Array.isArray(data?.items) ? data.items : [];
    tags.push(...items);
    if (!data?.hasMore || items.length === 0) break;
    startingAfter = items[items.length - 1].id;
  }
  return tags;
}

function resolveTagIds(names, tags) {
  return names.map((name) => {
    const match = tags.find((tag) => String(tag.name).trim().toLowerCase() === String(name).trim().toLowerCase());
    if (!match) throw new Error(`missing_tag:${name}`);
    return match.id;
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bodyTextToHtml(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

async function createNewsletter(job) {
  const data = await systemeFetch("/api/mailing/newsletters", {
    method: "POST",
    body: JSON.stringify({
      content: {
        subject: job.subject,
        previewText: job.previewText ?? null,
        editorType: "classic",
        bodyHtml: job.bodyHtml || bodyTextToHtml(job.bodyText),
        senderEmail: job.senderEmail,
        senderName: job.senderName ?? null
      }
    })
  });
  if (!Number.isInteger(data?.id)) throw new Error("create_newsletter_missing_id");
  return data.id;
}

async function setAudience(newsletterId, includeTagIds, excludeTagIds) {
  await systemeFetch(`/api/mailing/newsletters/${newsletterId}/included-tags`, {
    method: "PUT",
    body: JSON.stringify({ tagIds: includeTagIds })
  });
  await systemeFetch(`/api/mailing/newsletters/${newsletterId}/excluded-tags`, {
    method: "PUT",
    body: JSON.stringify({ tagIds: excludeTagIds })
  });
}

async function scheduleNewsletter(newsletterId, sendAt) {
  await systemeFetch(`/api/mailing/newsletters/${newsletterId}/schedule`, {
    method: "PUT",
    body: JSON.stringify({ scheduledAt: sendAt })
  });
}

async function verifySent(newsletterId) {
  const data = await systemeFetch(`/api/mailing/newsletters/${newsletterId}`);
  return data?.state?.isSent === true;
}

function update(job, patch) {
  Object.assign(job, patch);
  changed = true;
}

for (const job of jobs) {
  if (!job?.enabled || !job?.approved) continue;

  try {
    if (!job.id || !job.subject || !job.senderEmail || !(job.bodyHtml || job.bodyText)) {
      update(job, { workerStatus: "blocked", lastAttemptAt: now.toISOString(), lastError: "invalid_dispatch_payload" });
      continue;
    }
    if (!Array.isArray(job.includeTagNames) || job.includeTagNames.length === 0) {
      update(job, { workerStatus: "blocked", lastAttemptAt: now.toISOString(), lastError: "missing_include_audience_tag" });
      continue;
    }

    const sendAt = new Date(job.sendAt);
    if (Number.isNaN(sendAt.getTime())) {
      update(job, { workerStatus: "blocked", lastAttemptAt: now.toISOString(), lastError: "invalid_send_at" });
      continue;
    }

    if (job.workerStatus === "published") continue;

    if (job.newsletterId && job.workerStatus === "scheduled") {
      if (now.getTime() >= sendAt.getTime() + 2 * 60 * 1000) {
        const sent = await verifySent(job.newsletterId);
        update(job, {
          lastAttemptAt: now.toISOString(),
          ...(sent ? { workerStatus: "published", publishedAt: now.toISOString(), lastError: null } : {})
        });
      }
      continue;
    }

    const leadMinutes = Number(job.scheduleLeadMinutes || 360);
    const opensAt = sendAt.getTime() - leadMinutes * 60 * 1000;
    if (now.getTime() < opensAt) continue;

    if (!job.newsletterId && now.getTime() >= sendAt.getTime() - 30 * 60 * 1000) {
      update(job, {
        workerStatus: "blocked",
        lastAttemptAt: now.toISOString(),
        lastError: "missed_safe_schedule_window"
      });
      continue;
    }

    let includeTagIds = Array.isArray(job.includeTagIds) ? job.includeTagIds : null;
    let excludeTagIds = Array.isArray(job.excludeTagIds) ? job.excludeTagIds : null;
    if (!includeTagIds || !excludeTagIds) {
      const tags = await listTags();
      includeTagIds = resolveTagIds(job.includeTagNames, tags);
      excludeTagIds = resolveTagIds(job.excludeTagNames || [], tags);
      update(job, { includeTagIds, excludeTagIds, lastAttemptAt: now.toISOString() });
    }

    if (!job.newsletterId) {
      const newsletterId = await createNewsletter(job);
      update(job, {
        newsletterId,
        workerStatus: "created",
        lastAttemptAt: now.toISOString(),
        lastError: null
      });
    }

    await setAudience(job.newsletterId, includeTagIds, excludeTagIds);
    await scheduleNewsletter(job.newsletterId, job.sendAt);
    update(job, {
      workerStatus: "scheduled",
      scheduledAt: now.toISOString(),
      lastAttemptAt: now.toISOString(),
      lastError: null
    });
  } catch (error) {
    update(job, {
      workerStatus: "blocked",
      lastAttemptAt: now.toISOString(),
      lastError: error instanceof Error ? error.message : String(error)
    });
  }
}

if (changed) {
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify({ ...manifest, jobs }, null, 2)}\n`);
  console.log("Email worker state updated.");
} else {
  console.log("No email worker state changes.");
}
