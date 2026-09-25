# School subscriptions: implemented, awaiting Stripe sandbox connection

The specification requests an annual subscription per physical location with unlimited digital access. It does not set a subscription price. The provisional plan is **USD 399 per physical location per year**, with unlimited adult facilitators and annual automatic renewal. It is test-only. The source for the amount and validation is `lib/school-billing.mjs` (`SCHOOL_PLAN`). Do not change a price that already has active subscriptions without adding a versioned plan and a migration policy.

## Available flows

- `/school`: director creates one school/location per account; owns its billing and facilitator roster.
- Director starts a Stripe-hosted recurring card Checkout after explicit annual-renewal consent.
- Checkout uses server-owned pricing, fixed quantity, a durable attempt, a per-school transactional lease, and Stripe idempotency. Double clicks cannot create a second active subscription.
- Directors open a Stripe-hosted portal for invoices, payment-method updates and cancellation at period end. Plan/quantity changes are disabled. Portal configuration is created in the connected test account by the app.
- Subscription state is reconciled from Stripe, never trusted from the return URL or webhook payload alone. Paid invoice amount, currency, customer, subscription, price and billing period are checked. Cancellation, failed payment, expiry and recovery affect school access without creating permanent resource entitlements.
- A school subscription covers the current sample catalog. It cannot unlock absent premium video content. Individual sample entitlements remain independent when school access ends.
- Directors create single-use, seven-day facilitator join links, revoke unused links and remove members. Only a token hash is stored. Links are displayed once; no invitation emails are sent. Account sign-in plus a school membership is required. The site’s existing private audience is preserved, so a facilitator also needs permission to open the private website.

## Connect a sandbox securely

1. In the organization’s Stripe sandbox, obtain the test secret key. Store it as the hosted secret `STRIPE_SECRET_KEY`. Never paste keys into source, GitHub, browser code or logs. The app refuses live keys and live events.
2. Set `SITE_ORIGIN` to the exact deployed HTTPS origin with no trailing slash. The example file contains the current private origin. No pre-created Price ID is required: Checkout creates the fixed annual recurring price from server data.
3. Establish a publicly reachable HTTPS delivery path to `/api/stripe-webhook`, preserving the raw body and `Stripe-Signature`. **The private Sites gateway may block Stripe. Webhook delivery is not verified and no gateway exception or relay has been configured. Do not make the entire site public to solve this.** Configure a suitable external signature-preserving relay only after selecting and authorizing its infrastructure, or obtain an approved route-level hosting solution.
4. Configure the Stripe webhook destination for API version `2025-03-31.basil`, matching the pinned REST transport. Listen for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required` and `invoice.finalization_failed`. Save its signing secret as `STRIPE_WEBHOOK_SECRET`.
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

The initial test plan accepts only the exact USD 399 annual charge with one item, no coupons, credits, tax or proration. Such invoice variations fail closed. Live-mode enablement requires reviewed plan/pricing and access policies, Stripe Tax and receipts setup where needed, refunds/disputes and reconciliation, monitored webhook delivery, approved curriculum, and private premium assets. Seasonal and multi-site billing, director transfer, email delivery, and tax-exempt PO approval remain outside this annual school flow. An ambiguous Checkout older than 23 hours is blocked for support reconciliation rather than risking a duplicate charge. Retention/deletion and production legal terms still need approval.

## References

- [Stripe Checkout creation](https://docs.stripe.com/api/checkout/sessions/create)
- [Subscription webhooks and payment lifecycle](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Webhook retries and ordering](https://docs.stripe.com/webhooks)
- [Customer portal configuration](https://docs.stripe.com/api/customer_portal/configurations/create)
- [Basil invoice schema](https://docs.stripe.com/api/invoices/object?api-version=2025-03-31.basil)
- [Stripe Billing testing and test clocks](https://docs.stripe.com/billing/testing)
