import { getDeployStore, getStore } from "@netlify/blobs";
import { loadEmailJobs } from "../../automation/email-jobs";

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

export default async () => {
  let jobs;
  try {
    jobs = await loadEmailJobs(env("EMAIL_DISPATCH_FEED_URL"));
  } catch (error) {
    return Response.json({
      worker: "systeme-email",
      feedReady: false,
      feedError: error instanceof Error ? error.message : String(error),
      jobs: []
    }, { status: 502 });
  }

  const states = [];
  for (const job of jobs) {
    const state = await store().get(`jobs/${job.id}`, { type: "json" });
    states.push({
      jobId: job.id,
      sourceDistributionId: job.sourceDistributionId ?? null,
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

  return Response.json({ worker: "systeme-email", feedReady: true, jobs: states });
};

export const config = {
  path: "/hill/email-status"
};
