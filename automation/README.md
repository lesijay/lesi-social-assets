# Hill Systeme Email Worker

This is the unattended execution layer for Lit Lambs marketing newsletters.

## Architecture

Production Queue / Ari approval -> `automation/email-jobs.ts` execution manifest -> Netlify scheduled worker -> Systeme.io Public API -> Netlify Blobs state -> Hill verification/status.

The scheduled worker runs every 5 minutes on published Netlify deploys. It does **not** send arbitrary email. It only processes jobs that are both `enabled: true` and `approved: true` in the manifest.

## Safety rules

- The Systeme.io API key is never committed to GitHub. It must exist only as the secret Netlify environment variable `SYSTEME_API_KEY`.
- A job must name at least one included Systeme tag before it can be scheduled.
- The worker resolves tag names to Systeme tag IDs at execution time.
- The worker creates the newsletter, stores its Systeme newsletter ID immediately, sets included/excluded tags, then schedules the exact approved send time.
- If the worker reaches less than 2 minutes before the approved send time without a confirmed schedule, it blocks instead of sending late or immediately.
- Netlify Blobs stores job state so the 5-minute worker cannot create duplicate newsletters after a partial success.
- After the scheduled time, the worker retrieves the Systeme newsletter and marks the job `published` only when `state.isSent` is true.

## Adding an approved newsletter

Add one object to `automation/email-jobs.ts` with:

- unique `id` matching the Content ID / Distribution Queue item
- `enabled: true`
- `approved: true`
- ISO-8601 `sendAt`
- exact approved `subject`
- exact approved HTML body
- sender name/email
- `includeTagNames` matching existing Systeme.io tags
- optional `excludeTagNames`

A GitHub commit triggers the connected Netlify deployment. Once published, the scheduled worker will pick up the job inside its scheduling lead window.

## Controlled first test

Use a dedicated Systeme.io tag named `HILL TEST` containing only Lesi's test address. Do not enable a MAIN LIST job until the controlled test has successfully reached all three states:

1. `created`
2. `scheduled`
3. `published`

Status endpoint: `/hill/email-status`
