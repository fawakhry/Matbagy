# Matbagy Evaluations — Pilot UI v1 (2026-09-24)

## What exists
A local, paste-ready Cloudflare Worker build was produced for the **existing, independent** `matbagy-evaluations-pilot` Worker. It adds an Arabic single-origin UI at `/` and serves `/ui.css` and `/ui.js` within the same Worker. It keeps the existing evaluation API and adds authenticated pilot-only read endpoints `GET /api/pilot/customers`, `GET /api/customers/:pilot_id/messages`, `GET /api/customers/:pilot_id/facts`, `GET /api/customers/:pilot_id/actions`, plus `GET/POST /api/employees` (new POST allows only pilot_ IDs).

The UI includes login (admin token retained in page memory only), selecting/creating TEST customers, importing synthetic TXT, displaying messages/evidence references, entering/reviewing candidate facts for customers/staff, reading/writing versioned customer profiles with a human reviewer, and recording review-only action proposals. No AI analysis, WhatsApp transmission, TrendOS integration, external writes, scoring, or actual orders.

## Verification and limits
Local bundle: `matbagy_evaluations_ui_v1.zip` contains `worker_with_ui.mjs` (single-file dashboard deployment), `app.html`, `app.css`, `app.js`, `worker.base.mjs`, `build.mjs`, `smoke.test.mjs`, and `README_FIRST_AR.md`. The owner received the local sandbox artifacts in the originating chat. `node --check` on the generated Worker and UI JS passed; **7/7 local smoke tests passed**, including static assets/CSP, unauthorized request rejection, pilot-customer server-side scoping, synthetic evidence read, fact/action/snapshot reads, pilot-only employee create, and existing health response. **Live Cloudflare deployment of the UI was NOT performed or verified.** Do not state that the UI is live until the owner deploys and tests it.

The executable artifact is currently **local to the originating conversation; it is NOT uploaded to this GitHub repository**. A new chat can read this durable handoff, but must obtain the actual worker bundle from the owner/original conversation file, or regenerate and retest from source. Do not assume an inaccessible sandbox path still works in a future chat. This README documents the state and workflow, not a substitute for the complete source.

## Deployment boundary
Only the owner should manually review and deploy `worker_with_ui.mjs` via Cloudflare dashboard **on the evaluations Worker in Production**, after backing up its current live code and comparing changes made since the earlier API. Do not replace a newer live Worker blindly. Do not change D1/R2 bindings, Cloudflare Access, admin secret, or any TrendOS resource. Do not use Preview (its bindings may share data). Confirm `/health` first, then open `/` and check the login UI plus existing synthetic `pilot_demo_01` and version 1. If an error occurs, roll back to the prior active Worker version and log the failure without retrying SQL or uploading real conversations.

## Go-live restriction
No real customer/employee data until multi-user authorization, Preview isolation, data retention/deletion and operational audit controls are verified. No AI automation or automatic external actions in v1. Never commit secrets or transcripts to the public repository.
