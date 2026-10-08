# SwIRL STEM curriculum prototype

A private digital curriculum storefront and adult educator portal built from the supplied STEM Curriculum Website specification. Uses React/Vinext, Cloudflare Workers, D1, the Sites sign-in gateway and the existing Radix/Shadcn components.

See [QA_REPORT.md](QA_REPORT.md) for delivered features, executed checks and the specific gaps before a paid launch.

## Local development

Requires Node 22.13 or newer. Dependencies are pinned by package-lock.json.

```sh
npm run install:ci
npm run dev
```

Visitors sign in with Google (`lib/google-auth.mjs`, `lib/auth-routes.ts`): authorization code flow with PKCE, single-use state, nonce and ID-token claim checks, and 30-day sessions stored only as SHA-256 hashes in D1. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and an https `SITE_ORIGIN`, and register `<SITE_ORIGIN>/api/auth/callback` as the authorized redirect URI. Sites `oai-authenticated-*` headers are ignored unless `LOCAL_TEST_AUTH=true` **and** the request host is localhost; the integration suites and local dev rely on that (start the Worker with `--var LOCAL_TEST_AUTH:true`). Never set it in production. Admins are bootstrapped from `CONTENT_ADMIN_EMAILS` (Google-verified email).

To preview every screen with realistic records, run `node scripts/seed-sample-data.mjs http://127.0.0.1:8787 --persist-to .wrangler/state` against a local Worker; it refuses non-localhost origins.

```sh
node --test tests/core.test.mjs tests/school-billing.test.mjs tests/content.test.mjs tests/program-billing.test.mjs tests/individual-billing.test.mjs tests/social-layout.test.mjs tests/webhook-forwarder.test.mjs tests/youtube.test.mjs tests/storage-video.test.mjs tests/placeholder-videos.test.mjs tests/google-auth.test.mjs
npx tsc --noEmit
npm run build
```

Apply the generated migration to the local database once before API testing:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_overrated_firedrake.sql
```

Apply `drizzle/0001_damp_mister_fear.sql` then `drizzle/0002_past_azazel.sql` then `drizzle/0003_dear_rhino.sql`, `drizzle/0004_omniscient_falcon.sql`, `drizzle/0005_tiresome_moonstone.sql` and `drizzle/0006_abnormal_bill_hollister.sql` (Google sessions, sign-in state, contact messages) with the same local command. Run the built Worker locally on 127.0.0.1:8787, then `node tests/integration.mjs` , `node tests/school-integration.mjs` and `node tests/feature-integration.mjs`. Feature tests require a local synthetic `local_seedy` administrator in `content_users` (never create this identity in production). The integration harness sends synthetic trusted identity headers **only to localhost**, creates test records and does not make real payments. Its reports and downloaded samples are written to ignored `work/qa/`.

## Configuration

Copy the field names from `.env.example` when connecting Stripe test mode. Configure hosted secrets through Sites. No key is committed. `STRIPE_SECRET_KEY` must begin with `sk_test_`; live keys and live webhook events are refused. `SITE_ORIGIN` must be the exact HTTPS origin. The webhook is `/api/stripe-webhook`; an accessible, signature-verified delivery path is necessary before real Stripe integration testing.

Sample checkout is deliberately available and limited to sample content. It never grants premium files. Premium playback requires a verified paid entitlement; private MP4 videos now use the existing R2 storage without another media account.

## Content and routes

- `lib/catalog.ts`: built-in catalog (26 resources across five streams and six content types, including the Build-a-Bot Week and Chem-Lab Secrets camp tracks) and subjects.
- `lib/pricing.mjs`: school annual plan, seasonal pass and minimum creator price in cents. All prices are currently $0.50–$0.99 for real-card payment testing (Stripe's minimum charge is $0.50); set final prices here and in `lib/catalog.ts` before launch.
- `lib/streams.ts`: per-stream focus, deliverables, materials strategy, outcomes, standards alignment, common mistakes and cleanup tips. The standards rows were drafted from the specification and need educator review.
- `lib/placeholder-videos.mjs`, `lib/placeholder-server.ts`, `app/placeholder-video.tsx`: public-domain NASA education videos standing in for SwIRL recordings. `/api/lesson-video` checks course access for lesson and prep videos and relays byte ranges same-origin; intro, stream and course previews are public. Replace them by publishing studio courses with private MP4 uploads.
- `lib/course-pdf.ts`: lesson plan, student worksheet and combined course PDFs (English and preliminary Spanish) for `/api/download?kind=plan|worksheet|bundle|supplies`.
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
- `lib/storage-video.mjs`, `lib/video-server.ts`, `lib/video-upload-client.ts`: default private R2 multipart MP4 uploads and authenticated range playback.
- `lib/media.ts`: optional signed Mux adaptive playback and direct upload adapter. Configure `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_SIGNING_KEY_ID` and `MUX_SIGNING_PRIVATE_KEY` through hosted secrets.
- `lib/program-billing.mjs`, `lib/email.mjs`: seasonal licenses, PO approvals/invoices and a durable notification outbox. Optional email requires `RESEND_API_KEY` and verified `EMAIL_FROM`.

Bootstrap the actual owner with secret `CONTENT_ADMIN_EMAILS` or stable `CONTENT_ADMIN_USER_IDS`, verified against the hosting platform identity. The current owner allowlist is configured in hosted secrets, not this public source. `STRIPE_TAX_ENABLED` defaults false; enabling it requires the Stripe account's actual tax setup and full billing address. See the current feature-by-feature matrix and exact acceptance gaps in [QA_REPORT.md](QA_REPORT.md).

The Studio administrator sees configuration and connection diagnostics under **Payment & service readiness**. The Stripe connection probe makes a read-only balance request, not a charge. Individual purchases preserve pending orders and price snapshots across retries; private test receipts and Stripe invoice links are available in My Classroom. A loopback-only signed webhook bridge is included for sandbox testing while this Site stays private. See BILLING_SETUP.md.

## Video authoring and QA

For easy setup, choose a video purpose in Studio, select **YouTube link — easy setup**, and paste the URL of a video uploaded to YouTube as **Unlisted** with embedding allowed. Add the link, watch its preview and publish the reviewed curriculum. The site stores only its YouTube ID; no media file is copied. Lesson permissions still apply, but anyone who obtains an unlisted YouTube URL can watch or reshare it. This is an interim convenience option, not private video hosting. YouTube visibility, captions and embedding permissions are managed in YouTube Studio. The player includes a direct link if embedding is unavailable. The app validates link syntax, not video availability or privacy. Use **Private MP4 upload** when you need the existing access-controlled cloud storage.

YouTube regression checks: `node --test tests/youtube.test.mjs` and, against the local Worker, `node tests/youtube-integration.mjs`.


Save the lesson, select Student video, Prep video or Public preview video, and choose an H.264 MP4 with AAC audio. Export with Fast Start / Web Optimized enabled. Files may be up to 2 GiB, with durations up to two hours and metadata in the first 8 MiB. The studio uploads 8 MiB chunks. Pause finishes the current chunk; selecting the same file after an interrupted connection resumes saved chunks for six days. Cancel discards the upload. Watch the automatic private preview, then publish the reviewed revision. Existing published files cannot be removed until replaced by a new published revision. MP4 streaming supports seeking and checks access on each request; it does not prevent screen recording or replace adaptive transcoding.

`node tests/storage-video-integration.mjs` requires two synthetic files in ignored `work/qa/`: `qa-upload.mp4` (small) and `qa-multipart.mp4` (larger than 16 MiB). Generate them with an installed FFmpeg, for example:

```sh
ffmpeg -f lavfi -i testsrc2=size=640x360:rate=24 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 12 -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart work/qa/qa-upload.mp4
ffmpeg -f lavfi -i testsrc2=size=1280x720:rate=24 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 18 -c:v libx264 -b:v 10M -minrate 10M -maxrate 10M -bufsize 20M -x264-params nal-hrd=cbr:filler=1 -pix_fmt yuv420p -c:a aac -movflags +faststart work/qa/qa-multipart.mp4
```

The test files are owned synthetic patterns. No media binary or provider credentials are committed. Tests use localhost identities only. Real Stripe transactions are excluded from these checks.
