// Program prices in US cents, in one place. Kept under $1 while payments are tested with real cards;
// Stripe's minimum charge is $0.50. Individual resource prices live in lib/catalog.ts.
export const SCHOOL_ANNUAL_PRICE=99; // per physical location, per year, unlimited facilitators
export const SEASONAL_PASS_PRICE=75; // per subject or course, per location, 90 days
export const MIN_PRICE=50; // lowest price a creator can set in the studio
