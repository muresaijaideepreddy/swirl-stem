# SwIRL STEM curriculum prototype

A private digital curriculum storefront and adult educator portal built from the supplied STEM Curriculum Website specification. Uses React/Vinext, Cloudflare Workers, D1, the Sites sign-in gateway and the existing Radix/Shadcn components.

See [QA_REPORT.md](QA_REPORT.md) for delivered features, executed checks and the specific gaps before a paid launch.

## Local development

Requires Node 22.13 or newer. Dependencies are pinned by package-lock.json.

```sh
npm run install:ci
npm run dev
```

The starter's development sign-in flow uses a local synthetic account. Production identity comes from the Sites dispatcher; do not expose the Worker directly while trusting arbitrary client-supplied `oai-authenticated-*` headers.

```sh
node --test tests/core.test.mjs tests/school-billing.test.mjs tests/content.test.mjs tests/program-billing.test.mjs
npx tsc --noEmit
npm run build
```

Apply the generated migration to the local database once before API testing:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_overrated_firedrake.sql
```

Apply `drizzle/0001_damp_mister_fear.sql` and then `drizzle/0002_past_azazel.sql` with the same local command. Run the built Worker locally on 127.0.0.1:8787, then `node tests/integration.mjs` , `node tests/school-integration.mjs` and `node tests/feature-integration.mjs`. Feature tests require a local synthetic `local_seedy` administrator in `content_users` (never create this identity in production). The integration harness sends synthetic trusted identity headers **only to localhost**, creates test records and does not make real payments. Its reports and downloaded samples are written to ignored `work/qa/`.

## Configuration

Copy the field names from `.env.example` when connecting Stripe test mode. Configure hosted secrets through Sites. No key is committed. `STRIPE_SECRET_KEY` must begin with `sk_test_`; live keys and live webhook events are refused. `SITE_ORIGIN` must be the exact HTTPS origin. The webhook is `/api/stripe-webhook`; an accessible, signature-verified delivery path is necessary before real Stripe integration testing.

Demo checkout is deliberately available in this private prototype. It grants only sample content and must be removed or separated before a paid launch. Premium playback currently fails closed because no real course assets or video service credentials have been supplied.

## Content and routes

- `lib/catalog.ts`: sample product data and subjects.
- `app/site.tsx`, `app/views.tsx`, `app/globals.css`: storefront and classroom.
- `app/api/[...action]/route.ts`: account-scoped cart, checkout, requests, downloads and progress.
- `lib/server.ts`, `lib/core.mjs`: authorization, validation and payment checks.
- `lib/pdf.ts`: minimal plain-text sample PDF generation.
- `db/schema.ts`, `drizzle/`: persistent schema and generated migration.

Prices, curriculum, licensing proposals and sample PDFs are for demonstration. NASA/JPL content is attributed public sample material, not SwIRL-owned premium content and not an endorsement.

## School subscriptions

Open `/school` to create a director-managed physical location and adult facilitator invitations. The annual school plan is provisionally USD 399/year with unlimited facilitators. Subscription checkout, billing management and lifecycle handling are implemented for **Stripe test mode only**; connecting and exercising a real Stripe sandbox is still required. Read [BILLING_SETUP.md](BILLING_SETUP.md) for features, configuration, tests and production limitations.

- `lib/school-billing.mjs`: plan, recurring Checkout, portal, lifecycle synchronization and tenant authorization.
- `app/school.tsx`: school setup, billing and facilitator management.
- `tests/school-billing.test.mjs`: service tests using real SQLite and a fake Stripe API. Requires a Node runtime with `node:sqlite` (Node 22.13+).
- `tests/school-integration.mjs`: local Worker/D1 endpoint tests without Stripe credentials.

## Authoring and program operations

- `/studio`: the configured owner approves creators, publishes curriculum, reviews inquiries and PO requests, and manages approved public branding. Creators save lessons and upload their own teaching files.
- `/program`: seasonal passes, multi-site quotes, PO submission, certificate upload and invoices. `/school` switches locations and manages invitations and annual subscriptions.
- `/marketing` and `/sample`: configurable promotion templates and public lead-gated samples.
- `lib/content.mjs`, `lib/feature-routes.ts`, `lib/files.mjs`: revision-safe content, route authorization and private R2 PDF/file delivery.
- `lib/media.ts`: signed Mux playback and direct upload. Configure `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_SIGNING_KEY_ID` and `MUX_SIGNING_PRIVATE_KEY` through hosted secrets.
- `lib/program-billing.mjs`, `lib/email.mjs`: seasonal licenses, PO approvals/invoices and a durable notification outbox. Optional email requires `RESEND_API_KEY` and verified `EMAIL_FROM`.

Bootstrap the actual owner with secret `CONTENT_ADMIN_EMAILS` or stable `CONTENT_ADMIN_USER_IDS`, verified against the hosting platform identity. The current owner allowlist is configured in hosted secrets, not this public source. `STRIPE_TAX_ENABLED` defaults false; enabling it requires the Stripe account's actual tax setup and full billing address. See the current feature-by-feature matrix and exact acceptance gaps in [QA_REPORT.md](QA_REPORT.md).
