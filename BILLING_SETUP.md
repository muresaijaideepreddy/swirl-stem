# Stripe billing: implemented, awaiting account acceptance

The specification requests an annual subscription per physical location with unlimited digital access. It does not set a subscription price. The provisional plan is **USD 399 per physical location per year**, with unlimited adult facilitators and annual automatic renewal. It is test-only. The source for the amount and validation is `lib/school-billing.mjs` (`SCHOOL_PLAN`). Do not change a price that already has active subscriptions without adding a versioned plan and a migration policy.

## Available flows

- `/school`: director creates and switches between separate school/locations per account; owns its billing and facilitator roster.
- Director starts a Stripe-hosted recurring card Checkout after explicit annual-renewal consent.
- Checkout uses server-owned pricing, fixed quantity, a durable attempt, a per-school transactional lease, and Stripe idempotency. Double clicks cannot create a second active subscription.
- Directors open a Stripe-hosted portal for invoices, payment-method updates and cancellation at period end. Plan/quantity changes are disabled. Portal configuration is created in the connected test account by the app.
- Subscription state is reconciled from Stripe, never trusted from the return URL or webhook payload alone. Paid invoice amount, currency, customer, subscription, price and billing period are checked. Cancellation, failed payment, expiry and recovery affect school access without creating permanent resource entitlements.
- A verified paid test school subscription covers the published catalog, including uploaded premium courses. Absent premium assets remain unavailable. Individual sample entitlements remain independent when school access ends.
- Directors create single-use, seven-day facilitator join links, revoke unused links and remove members. Only a token hash is stored. Links are displayed once; no invitation emails are sent. Account sign-in plus a school membership is required. The site’s existing private audience is preserved, so a facilitator also needs permission to open the private website.

## Connect a sandbox securely

1. In the organization’s Stripe sandbox, obtain the test secret key. Store it as the hosted secret `STRIPE_SECRET_KEY`. Never paste keys into source, GitHub, browser code or logs. The app refuses live keys and live events.
2. Set `SITE_ORIGIN` to the exact deployed HTTPS origin with no trailing slash. The example file contains the current private origin. No pre-created Price ID is required: Checkout creates the fixed annual recurring price from server data.
3. Establish a publicly reachable HTTPS delivery path to `/api/stripe-webhook`, preserving the raw body and `Stripe-Signature`. The private Sites gateway blocks unauthenticated delivery. A local signed sandbox bridge is implemented below; it has automated tests but has not received a real account event. Keep the Site private. Production requires an approved continuously available delivery route.
4. Configure the Stripe webhook destination for API version `2025-03-31.basil`, matching the pinned REST transport. Listen for `checkout.session.expired`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required` and `invoice.finalization_failed`. Save its signing secret as `STRIPE_WEBHOOK_SECRET`.
5. Publish the new environment configuration and run the actual sandbox checks below. No credentials are currently installed, no Stripe account was created, and no real or sandbox card transaction was made by this implementation task.

Billing refresh on signed-in use provides a fallback when webhooks are unavailable. Authorization uses a maximum 60-second freshness window and expires at the verified paid-through/billing-period end. A refresh failure denies school-derived access; it does not delete independent individual resources or progress. Event IDs are durably deduplicated only after successful processing; concurrent school updates request a retry instead of overwriting each other. Scheduled/offline reconciliation is not implemented.

## Sandbox acceptance tests still required

Use Stripe test cards and test clocks, not real payment details:

- Successful first payment, declined card, authentication-required card and abandoned/expired Checkout.
- Refresh/double click and simultaneous tabs; lost response; payment completes before the browser returns; browser never returns.
- Renewal succeeds, renewal fails, payment recovery, invoice finalization failure and canceled subscription.
- Cancel at period end, undo scheduled cancellation, immediate dashboard cancellation and subscription expiry.
- Portal invoices/payment method/cancellation, return-page refresh, duplicate and out-of-order signed webhooks, failed delivery/retry and webhook/return races.
- Different director/facilitator cannot manage another school or replay a removed member’s invite.

Automated tests use actual SQLite and a fake Stripe transport to cover these service rules; local Worker/D1 tests cover endpoint permissions and persistence. They are not a substitute for a connected Stripe sandbox test.

## Deliberate limits before production

The base plan remains exactly USD 399 per year, one item, without coupons, credits or proration. Optional Stripe automatic tax is supported when `STRIPE_TAX_ENABLED=true`; the app checks the unchanged base price and verified paid tax-inclusive amount. Configure tax registrations in the actual Stripe account before enabling it.

`/program` also implements a provisional USD 149 seasonal pass for 90 days, scoped to a selected theme or module and physical location. The start date, access expiry and price are stored before Checkout. Overlapping pending checkouts are reused. Recurring annual billing and PO approval share the school lock to prevent conflicting attempts.

PO requests include an owned location, PO number, Net30 request, billing address and optional private tax-exemption PDF. Only an administrator may approve the exemption and invoice. Invoice items attach to a specific test invoice; only verified paid invoices create an annual fixed-term license. Multi-site quotes are durable PDFs; custom enterprise commercial approval remains manual.

Production rollout still requires real Stripe sandbox acceptance, approved prices and tax/receipt configuration, refund/dispute policies, monitored webhook delivery and reconciliation, approved content and legal terms. Live keys are refused. Ambiguous Checkout attempts beyond the provider idempotency window are blocked for review rather than creating a second charge. Email delivery needs a configured verified sender; acknowledgments are queued while disconnected. See [QA_REPORT.md](QA_REPORT.md) for the current implementation and test matrix.

## References

- [Stripe Checkout creation](https://docs.stripe.com/api/checkout/sessions/create)
- [Subscription webhooks and payment lifecycle](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Webhook retries and ordering](https://docs.stripe.com/webhooks)
- [Customer portal configuration](https://docs.stripe.com/api/customer_portal/configurations/create)
- [Basil invoice schema](https://docs.stripe.com/api/invoices/object?api-version=2025-03-31.basil)
- [Stripe Billing testing and test clocks](https://docs.stripe.com/billing/testing)

## Individual purchase recovery and receipts

Individual Checkout saves an immutable item/price/email/origin/tax snapshot before contacting Stripe. One pending session is reused across tabs, changed carts and prices. Lost provider responses use identical idempotent requests. Expired sessions can be replaced; ambiguous old attempts stop for reconciliation. The cart shows the pending order and offers resume/cancel. Confirmation and webhooks re-fetch Stripe data and verify identity, currency, subtotal, tax, payment and test mode before granting access. PDF confirmations are clearly labeled test receipts. Expanded Stripe invoice links can be refreshed from My Classroom.

Annual checkout and PO approvals use the same location lock. Pending invoices and unresolved annual Checkout sessions prevent another annual invoice/subscription. A canceled historical subscription cannot release a newer completed payment attempt.

## Private-site sandbox webhook bridge

The included bridge preserves the existing owner-private website audience. It listens only on `127.0.0.1:8788`, verifies each Stripe signature and timestamp, rejects live events, limits payload size and forwards unchanged signed bodies to the single fixed Site webhook. Redirects and upstream failures return retryable errors. Runtime secrets remain in memory and are not logged or saved.

1. Authenticate the official Stripe CLI with the intended sandbox account. Run `stripe listen --forward-to http://127.0.0.1:8788/stripe-webhook`.
2. Store the listener's signing secret in hosted `STRIPE_WEBHOOK_SECRET`, alongside the account's test `STRIPE_SECRET_KEY`. Keep these out of chat and GitHub. Publish/reload environment configuration using Sites.
3. An authorized Site owner obtains a current private service-access token through Sites. Start `node scripts/stripe-webhook-bridge.mjs` in an interactive terminal and pass a single JSON object on its hidden stdin with fields `webhookSecret` and `siteAccessToken`. Do not put either secret in command arguments or a file. The two signing-secret values must match.
4. Open Studio, inspect **Payment & service readiness**, and run **Verify Stripe sandbox connection**. This only reads the Stripe balance endpoint. It is not proof of Checkout acceptance.
5. Exercise the acceptance scenarios above with Stripe test cards. Check that a signed event is received, the matching order/subscription/invoice is fulfilled once and access persists after reload. Use provider events for real app-owned test objects; generic CLI fixture events alone do not prove fulfillment.
6. Stop both local processes afterward. This bridge is a developer sandbox tool, not an always-on production service. Rotate/refresh secrets and service tokens through their normal secure interfaces.

[Official Stripe CLI listener options](https://github.com/stripe/stripe-cli/blob/master/pkg/cmd/listen.go) and [Stripe webhook testing](https://docs.stripe.com/webhooks) describe the local forwarding workflow. No CLI login, key configuration or provider event has been completed for this project yet.
