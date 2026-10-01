# Lit Lambs Newsletter Automation

## Purpose

This layer removes browser dependence from Lit Lambs marketing email distribution.

Flow:

`Production Queue → Distribution Queue → Hill queue sync → automation/email-jobs.json → Netlify worker → Systeme.io Public API → Systeme native scheduler → worker verification → Hill closes both queues`

## Source of truth

The Google Sheet **Lesi Content & IP Operating System** remains the editorial and approval source of truth. `automation/email-jobs.json` is only the machine-readable execution handoff.

## Runtime

- Netlify function: `netlify/functions/systeme-email-worker.mts`
- Schedule: every 5 minutes
- Worker status: `https://lesi-social-assets.netlify.app/hill/email-status`
- API health: `https://lesi-social-assets.netlify.app/hill/systeme-health`
- Secret: `SYSTEME_API_KEY` in Netlify environment variables

## Manifest contract

Routine sync should update only `automation/email-jobs.json`, never worker code.

Each enabled job should contain:

- `id`: Content ID from Distribution Queue
- `sourceDistributionId`: Distribution Queue ID
- `sourceQueue`: originating queue name
- `enabled`: true only when approved and scheduled
- `approved`: true only when the queue approvals are valid
- `sendAt`: exact send datetime as ISO UTC
- `subject`: exact approved subject
- `bodyText`: exact approved body; runtime converts it safely to HTML
- `senderEmail` / `senderName`: exact approved sender
- `includeTagNames`: exact Systeme audience tag(s)
- `excludeTagNames`: explicit exclusions only
- `scheduleLeadMinutes`: normally 360

## Safety rules

- Never enable a Hold row.
- Never change subject, body, sender, audience, CTA, date or time during sync.
- If an unsynced send is less than 30 minutes away, block rather than rush.
- Do not substitute Gmail or Zoho for a marketing newsletter.
- A manifest disable is not a cancellation after Systeme has already scheduled the newsletter.
- Jobs are upserted by Content ID to prevent duplicates.

## Completion

A newsletter is not complete when it is merely in the manifest or scheduled. It is complete when the worker reports `published`, Hill records the Systeme newsletter ID and Published At, and both Distribution Queue and the source Production Queue are updated.
