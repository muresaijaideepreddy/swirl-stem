# SwIRL specification implementation and validation

Updated October 7, 2026 against **STEM Curriculum Website.docx**, including its detailed PRD. The software workflows below are implemented. This remains a private, test-mode website; actual provider accounts, approved curriculum and launch acceptance are separate outstanding work. No real payment was made.

## Requirement coverage

| Document requirement | Implementation | Verification / remaining dependency |
| --- | --- | --- |
| Introduction video, hero CTAs and five STEM domains | Homepage, five subject pages, public video placeholder, owner-selectable introduction video | Placeholder remains until an approved introduction is uploaded and Mux is connected |
| Interactive stream previews without site account | Five sample tabs and public PDF previews | Local anonymous API checks; private hosting still requires owner-approved site access |
| Partner logos and impact counters | Administrator can upload permission-approved logos and edit factual metrics | No invented endorsement or impact claim; organization must supply approved data |
| Age, topic, format, duration, supply and material search | Catalog and classroom filters, subject/time word search, week-camp tracks, sorting, combined filters and empty-state reset | Core and browser checks |
| Digital store and individual purchases | Durable cart, sample checkout, immutable pending Stripe orders, cross-tab retry recovery, verified fulfillment, private receipts and invoice refresh | Real Stripe sandbox acceptance not performed |
| Sample gate and pilot inquiries | Name/email/role/organization/consent validation, expiring sample link, sample video link, admin inquiry inbox and review notes | Anonymous/sample endpoint tests; no email claim without configured delivery |
| Daycare, after-school, camp and individual pages | Audience pages, parent communication sheets, pacing guides, week plan and Friday showcase PDF templates | Templates require educator review before classroom use |
| Annual per-site subscription | USD 399/year provisional price, unlimited adult facilitators, recurring checkout, billing portal, renewal/cancellation/access lifecycle | Simulated Stripe tests; actual Stripe account is unconfigured |
| Seasonal pass per theme/module/site | USD 149 for 90 days, server-owned scope/price/dates, checkout and paid confirmation | Service tests include duplicate attempts, forged returns and lost-response recovery |
| Multi-site director management | Multiple independent locations, location switcher, private rosters, per-location billing and licenses | Worker tests verify location isolation |
| Enterprise / 10+ location requests | Multi-site quote/inquiry form, persistent server-priced formal PDF quote | Custom commercial terms still require organization review |
| PO, exemption certificates and Net30 | Private PDF certificate upload, requester/admin access, administrator review, test invoice creation, hosted invoice link, payment refresh and annual license after verified payment | Local persistence/access tests and simulated invoice tests; no exemption is self-approved |
| Facilitator invitations and supplies | Single-use expiring shareable join links, revoke/remove, materials CSV for each module | School/API tests. Share links and CSV implement the alternatives permitted by the document |
| Marketing hub | Customizable flyer/newsletter PDFs and social graphic download | Template endpoints checked; actual marketing copy/photos remain owner inputs |
| CMS without developer involvement | Creator access requests, owner approval, drafts, metadata/taxonomy, nested lessons, English/Spanish PDF books/plans/workbooks, images, captions, supplies and resumable video upload/cancel controls | Browser created/saved/reopened/uploaded/published a sample lesson; video transport needs Mux |
| Publication and safe editing | Administrator-only publish/archive, ownership, optimistic revision checks, stable lesson IDs, separate public snapshots, revision-fenced file attachment | Tests cover stale saves, first-upload race, ownership and archive bypass |
| Private adaptive video streaming | Mux direct upload, processing status, signed HLS playback, prep/student/preview slots, captions | Integration implemented; credentials/signing key and actual media are missing, so provider playback is unverified |
| Classroom / zero-prep portal | Preparation, presentation, quick stats, steps, saved completion, fullscreen mode, resource search | Actual local browser workflow checked |
| PDF viewer, bundles and watermarking | Private R2 files, individual viewer/download, combined uploaded PDFs plus generated teaching notes/materials, account watermark | Worker upload/download checks and rendered PDF inspection |
| English/Spanish worksheets | Language-tagged uploads, language switch, explicit missing-translation state | API missing-language check and browser switch; actual translations must be supplied |
| Ten-video complete courses | Ten stable lesson slots; premium publication requires appropriate documents and processed videos | Missing-assets checks prevent pretending a complete course exists |
| Durable records and usage logs | D1 content, roles, accounts, schools, requests, licenses, notifications and audit events | Generated migrations and real SQLite / Worker tests |
| Adult privacy and print layouts | Adult facilitator model, no student accounts, private resources and rosters, draft privacy/terms, print CSS | Technical controls implemented; no COPPA/FERPA certification or legal approval claimed |

## Executed checks

**181 automated checks passed: 111 service/validation groups and 70 built-Worker API scenarios.**

- 17 core validation groups (`tests/core.test.mjs`).
- 34 annual billing/team service groups (`tests/school-billing.test.mjs`).
- 19 content/file service groups (`tests/content.test.mjs`).
- 19 seasonal/PO/notification service groups (`tests/program-billing.test.mjs`).
- 18 individual Stripe billing groups (`tests/individual-billing.test.mjs`).
- 1 bounded social-graphic layout group (`tests/social-layout.test.mjs`).
- 3 private webhook-forwarding groups (`tests/webhook-forwarder.test.mjs`).
- 37 storefront Worker/D1 API scenarios (`tests/integration.mjs`).
- 13 school Worker/D1 API scenarios (`tests/school-integration.mjs`).
- 20 authoring, private file, classroom, sample, receipt, readiness and PO Worker/D1 API scenarios (`tests/feature-integration.mjs`).

The service harness uses actual SQLite and an injected fake Stripe transport. API tests ran against the production Worker build on localhost using synthetic adult identities. They contacted no payment, video or email provider. TypeScript checking and the production build passed. The build warns about the size of the on-demand media chunk; the under-two-second requirement is not yet certified.

Important checks include invalid/missing/oversized form values, malformed JSON, wrong content type, cross-origin requests, authorization and tenant boundaries, conflicting saves, upload/publication races, malformed PDF/image/caption inputs, nested PDF actions and attachments, deleted-file retries, public-catalog privacy, archived access, duplicate payments, webhook signatures, invoice ownership/amounts, tax base validation, expiry, invite replay and removed members.

The final rejection-to-upload sequence verifies recovery after invalid, foreign-owner and cross-origin uploads. It caught an unread-request-body issue in the Worker proxy; bounded buffering before early validation fixed it. No failed test is counted as passed.

## Browser and PDF evidence

The local browser created a new lesson, rejected a blank required form, saved/reopened it, uploaded a PDF, published it, found it in the catalog, completed sample checkout, opened the classroom and saved completion. English/Spanish selection and combined download were checked. The combined download contained the uploaded worksheet and generated lesson notes/materials. Rendered pages had no clipped or overlapping text. The checked 320 px and 1024 px classroom viewports had no horizontal overflow; browser error logs were empty at inspection.

The previous release verified owner administrator controls and all 21 expected D1 tables on the private deployment. This revision adds migration 0003 for immutable order snapshots and verified payment/receipt fields. Deployment verification is recorded separately from local tests.

These are bounded, executed checks, not a claim that every possible edge case or device has been tested. The previous storefront and school browser checks remain documented in Git history.

## External setup and acceptance still required

1. **Stripe:** install organization-owned test credentials, run the included loopback signature-verifying bridge or an approved delivery route through the private hosting gateway, then exercise successful/declined/3DS cards, renewal/test clocks, invoice payment, portal and real sandbox webhook delivery. Live keys remain refused. Tax configuration must match actual registrations and approved exemption evidence.
2. **Mux:** connect API credentials and signing keys; upload approved video content and validate resumable upload, processing, captions and signed adaptive playback against that account.
3. **Email:** configure Resend and a verified sender. PO acknowledgments are queued honestly while unavailable. Review/retry the outbox from the studio; expired ambiguous retries require operational review.
4. **Content/business approval:** provide the introduction, real premium videos, teaching PDFs, translations, images, standards mappings, approved logos/metrics, final prices and license/refund/privacy/safety terms. Generated samples are placeholders permitted by the original brief.
5. **Launch QA:** run the requested five-center pilot (one daycare, two after-school programs, two camps), test physical iPads and lower-spec Android tablets, screen readers and degraded connectivity, and measure the two-second load target. No real center pilot or compliance certification has occurred.
6. **Production payment operations:** live-mode rollout, refund/dispute policy and monitored reconciliation remain launch work. The app's test billing flows are implemented, but account-level setup and actual payment acceptance cannot be claimed complete.

## Specification decisions

The original five-domain list includes robotics and takes priority over the later four-stream example. The source permits placeholders until final media is provided. Vendor names in its technical-stack section are recommendations: the app uses the existing Sites identity gateway, D1/R2, an integrated content studio, Stripe and Mux adapters. A shareable invite link and downloadable materials CSV satisfy the explicitly offered alternatives.

GitHub source remains public. The deployed website retains its owner-private audience as requested. Other facilitators will need explicit site-audience access before they can use a join link. No student or production customer data is seeded by tests.

## Final implementation review and fixes

Repeated document, billing and UI reviews closed the concrete gaps found: persisted individual orders before Stripe creation; immutable retry parameters and cross-tab pending-session reuse; price/currency/tax/ownership verification; refreshable Stripe invoice links; owned test receipts; cancellation/payment races; PO/subscription collision guards including stale canceled subscription state; PDF Book format/upload/publication/storefront filters; classroom topic/time/supply filters; author-only unpublished previews and safe handling of unsaved drafts; language-specific uploaded supply CSVs; canceling in-flight video upload promises and provider cleanup; fencing late video responses; Spanish generated captions; and bounded long social-graphic text.

The current local browser checked the new readiness panel, disabled sandbox probe without credentials, PDF Book format and upload purpose, a saved unpublished preview, English fallback and uploaded Spanish CSV selection, disabled preview before first save, combined “30 min physics” search, combined-filter empty states and storefront PDF Book filtering. Captured browser errors were empty at the final inspection. Earlier full create/save/upload/publish/classroom and PDF-render evidence remains applicable; no provider video operation has been claimed tested.

Payment setup is now visible to the administrator in Studio. Its configuration checks and read-only Stripe connection probe do not prove card processing, renewals or webhook fulfillment. The included private-site webhook bridge has signature, tamper/replay, live-event, payload-limit, fixed-destination, redirect and upstream-failure tests. It has not been connected to the organization's Stripe account. See BILLING_SETUP.md for account acceptance steps.
