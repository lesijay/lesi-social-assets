import { getDeployStore, getStore } from "@netlify/blobs";
import { emailJobs } from "../../automation/email-jobs";

const STORE_NAME = "hill-systeme-email-worker";

function netlifyGlobal(): any {
  return (globalThis as any).Netlify;
}

function store() {
  const context = netlifyGlobal()?.context?.deploy?.context;
  return context === "production"
    ? getStore(STORE_NAME, { consistency: "strong" })
    : getDeployStore(STORE_NAME);
}

export default async () => {
  const states = [];
  for (const job of emailJobs) {
    const state = await store().get(`jobs/${job.id}`, { type: "json" });
    states.push({
      jobId: job.id,
      enabled: job.enabled,
      approved: job.approved,
      sendAt: job.sendAt,
      status: state?.status ?? "pending",
      newsletterId: state?.newsletterId ?? null,
      scheduledAt: state?.scheduledAt ?? null,
      publishedAt: state?.publishedAt ?? null,
      lastAttemptAt: state?.lastAttemptAt ?? null,
      lastError: state?.lastError ?? null
    });
  }

  return Response.json({ worker: "systeme-email", jobs: states });
};

export const config = {
  path: "/hill/email-status"
};
