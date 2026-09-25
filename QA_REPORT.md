# SwIRL prototype review and test results

Reviewed against **STEM Curriculum Website.docx** on September 25, 2026. The basic functional prototype is implemented. It is a private demonstration, not a launch-ready paid curriculum service. No real charge was made and no Stripe account was created.

## Implemented and checked

- Responsive homepage with an attributed NASA/JPL educational image and public video placeholder.
- Five curriculum subjects, including robotics, with dedicated subject URLs.
- Eight sample resources with keyword/material search, age, format, duration and supply filters, sorting, and empty states.
- Product pages, ten-step complete-course outlines, supply lists and clear digital-only disclosures.
- Signed-in adult classroom, durable D1 carts, demo orders, entitlements, requests and lesson progress.
- Free demo checkout, server-authoritative product IDs/prices, duplicate prevention and idempotent retries.
- Stripe **test-only** Checkout adapter and signed webhook endpoint. It rejects live secret keys and live events. Actual Stripe calls are unverified because no account credentials were provided.
- Server-authorized sample PDF bundles, Spanish sample observation worksheets and materials CSVs.
- Facilitator prep, presentation view, download tabs and saved progress.
- Audience pages for daycare, after-school, camps and families; illustrative pricing; saved pilot, quote and PO requests; downloadable draft quote PDFs.
- No unverified partner logos, impact statistics, standards claims or compliance certifications.

## Executed automated checks

**16 core test groups passed** with `node --test tests/core.test.mjs`.

Covered cart input validation and deduplication; Unicode names; email normalization; missing fields; invalid roles/request types/consent; input length and site-count boundaries; idempotency-key validation; cross-origin protection; refusal of live Stripe keys; matching paid session/amount/currency/user/order checks; valid, forged, modified and expired webhook signatures; case/whitespace search; material search; conflicting filters; duration boundaries; and empty results.

**37 integration scenarios passed** with `node tests/integration.mjs` against the built local Cloudflare Worker and D1 database. Synthetic adult accounts were used.

| Area | Verified scenarios |
| --- | --- |
| Identity | Anonymous state/download rejection; empty new account; another account cannot see orders, resources or quotes |
| Input handling | Unknown IDs/actions; null/array/malformed JSON; wrong content type; oversized data; cross-origin writes |
| Cart | Empty checkout; add/remove last item; concurrent repeated adds; concurrent distinct adds; already-owned resource rejection |
| Checkout | Browser price/item tampering ignored; free demo fulfillment; repeated and concurrent retry idempotency; changed checkout mode rejected; unconfigured Stripe fails safely |
| Access | Prepurchase download denied; unknown resource and invalid format/language rejected; missing premium videos fail closed |
| Files | Four-page combined English PDF; two-page Spanish sample; material CSV; private draft quote PDF; no-store caching |
| Progress | Invalid indexes/types rejected; concurrent changes preserved; reload persistence; unowned curriculum denied |
| Requests | Saved quote request; repeated identical request; changed payload rejected; invalid email/consent; rate limit; lost-response retry after reaching limit |
| Payment attacks | Forged webhook and forged Checkout return cannot grant access |
| Routing | Unknown API, product and subject paths return 404 |

Earlier integration runs exposed a connection issue after rejecting an unread request body. Reading the request body before validation fixed it; the final run passed all 37 scenarios. No failing result was silently counted as a pass.

## Browser and PDF checks

- Followed the actual UI from signed-out classroom through local test sign-in, catalog, course, cart, free demo checkout, classroom, progress marking and downloads tab.
- Verified empty catalog state and robotics results using the registered WebMCP tool; invalid tool input rejected without changing state.
- Inspected desktop homepage at 1440 px, classroom at 390 px, and narrow layout at 320 px. The checked desktop and 320 px views had no horizontal overflow.
- Confirmed the external hero image loaded. Verified video-dialog labeling and the original-source fallback link. The embedded NASA/JPL sample loaded and played in the browser.
- Rendered and visually inspected all seven pages across the English bundle, Spanish sample and draft quote. No clipped or overlapping text was seen.
- Final TypeScript checking passed with no errors. The production Worker build also completed successfully.

These are the executed checks, not a claim that every possible edge case has been tested. Actual iPads/Android devices, screen-reader use, browser-wide compatibility, 200% text enlargement, degraded-network behavior and the under-two-second load target need separate validation.

## Required before a real paid launch

1. Connect an organization-owned Stripe sandbox through secret configuration. Configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `SITE_ORIGIN`. The current private access gateway must allow verified Stripe webhooks through an appropriate public endpoint before webhook delivery can be tested. Do not expose account data or change the site's audience merely to make the endpoint reachable.
2. Run real sandbox cases: successful/declined/3DS cards, canceled/expired sessions, browser closed after payment, return/webhook races, duplicate/out-of-order delivery, and recovery after Stripe timeouts. The current adapter supports one-time card purchases only.
3. Add production order price snapshots, reconciliation, refunds/disputes and documented entitlement-revocation policies. Annual renewals, cancellation-at-period-end, payment recovery, tax calculation, receipts and billing-portal integration are not implemented.
4. Upload approved premium video assets to a private streaming provider such as Mux. Store asset mappings server-side. After checking the adult account, entitlement, organization and expiry, issue short-lived signed playback tokens. Protect previews/thumbnails too; make token lifetime long enough for playback. The current endpoint intentionally refuses unavailable premium content. Demo entitlements must never grant production content.
5. Configure private PDF storage and allowlisted resource IDs for the actual course bundles. Download authorization cannot prevent redistribution after a legitimate download; watermarking can deter it.
6. Decide individual/site/seasonal license scope, seat counts, transfer rules, expiry, updates, refunds and final pricing. Implement director/facilitator roles, tenant boundaries, invitations, expired/reused invitation checks and seat limits. The program-management tab currently explains this pending scope.
7. Supply the introduction video, real course videos, teaching PDFs, photos, captions, translations and marketing resources. Add a CMS/editor workflow. The current sample PDFs demonstrate the format and require educator review.
8. Configure contact/email delivery, form operations, tax-exempt document upload and invoice/PO approval. Current requests are saved only; emails are not sent and payment terms are not approved.
9. Approve privacy, retention/deletion, licensing and safety policies. No student accounts are created. No legal compliance certification is implied.

## Specification decisions

- The original brief explicitly lists five domains; the later generated outline lists four. The original five-domain list takes priority.
- Ages 3–14 come from the detailed outline and extend beyond elementary-only coverage. Sample age tiers need curriculum-owner review.
- Thirty-minute video length is distinct from the activity duration. Ten-video course outlines are placeholders, not claims that those videos exist.
- No shipped products or materials are offered.
- Signed streaming deters unauthorized access but cannot guarantee a video is impossible to copy or screen-record.

## Primary references

- [Stripe Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment?payment-ui=stripe-hosted)
- [Stripe webhook verification and delivery](https://docs.stripe.com/webhooks)
- [Stripe subscription lifecycle](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Stripe refunds](https://docs.stripe.com/refunds)
- [Mux signed playback](https://www.mux.com/docs/guides/secure-video-playback)
- [Mux DRM limitations](https://www.mux.com/docs/guides/protect-videos-with-drm)
- [NASA/JPL paper helicopter activity and sample video](https://www.jpl.nasa.gov/edu/resources/project/make-a-paper-mars-helicopter-2/)
- [JPL image-use policy](https://www.jpl.nasa.gov/jpl-image-use-policy/)
