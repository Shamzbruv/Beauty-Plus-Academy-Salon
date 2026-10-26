# Beauty Plus Academy & Salon

Public website: https://beautyplusacademyandsalon.com
Owner studio: https://beautyplusacademyandsalon.com/admin/

The owner studio manages the existing website without editing code: page copy, images and links; salon services and deposits; courses and kit-inclusive prices; scheduled promotions; events and custom registration forms; gallery stories; FAQs and testimonials; payment methods; business policies and section visibility. Each page includes an information button. Drafts and archived items are private. Saved edits have optimistic concurrency checks and version history.

## Owner access

The business contact already listed on the website, `forresterpetagay30@gmail.com`, is the approved owner identity. Sign-in uses Supabase Auth. Only verified users listed in `bp_admins` receive owner permissions. Public signup and editable profile metadata cannot grant permissions. Use the private owner setup link supplied separately to choose a password. Password reset email requires working outbound email delivery in the Supabase project; the default Supabase mail service restricts recipients. No authentication credentials are committed here.

## Backend

This website uses the Supabase project configured in `assets/config.js`. That file contains only a public publishable key. Every public table has RLS and explicit grants. `bp_submissions` is private to the approved owner; visitors can submit a request but cannot read other people's details. Public request validation runs in a narrowly scoped trigger: it derives prices from published items, validates custom event answers, serializes capacity allocation, prevents duplicate active event registrations, and stores the original form questions. Payment status is always pending on a public submission, regardless of the submitted payload.

The migration is in `supabase/migrations/`; the imported original website content is in `supabase/seed-content.json`. They have already been applied to the configured backend. Do not re-run the initial migration or seed against the same project.

Images are uploaded to the `bp-media` bucket, limited to 10 MB and supported image MIME types, with public reading and owner-only writing. Keep private documents out of this bucket.

## Payments

- **WiPay Jamaica:** the existing account number was carried over. A saved request can open WiPay's hosted checkout. The owner can update the account, fee setting, instructions, or replace checkout with a hosted payment link.
- **Fygaro and NCB Payment Buttons:** configure approved merchant-hosted payment links in Payment methods. For fixed prices, attach an item-specific link to the matching service, course, or event, and update the provider link when its price changes. General links must support the intended variable amount.
- **Bank transfer:** existing Scotiabank details were imported from the original website. Verify them before accepting transfers. The owner can edit all instructions.
- **Pay at the salon and other hosted links:** configurable in Payment methods.

Official setup links and step-by-step guidance are in the dashboard. The website never collects card numbers or secret payment credentials. Merchant approval and fees are managed by providers.

**Payment verification is manual.** A redirect or customer-supplied receipt/reference does not mark a request paid. Check your bank/provider, then update the owner record. Promotions advertise an offer; their optional codes are display-only and do not calculate discounts. Change catalog prices separately when needed.

New requests are stored in the dashboard immediately. They do not depend on the old email/PDF flow. The old unauthenticated email endpoint has been retired; automatic customer and owner email notifications are not configured by this change. Customer confirmations include a request reference and a WhatsApp follow-up link. Student records cover enrollment and tuition requests, not a calculated outstanding-balance ledger.

## Hosting and development

The PHP entrypoint is retained so the existing hosting setup can continue to serve the site. Public pages and the dashboard use committed browser bundles; production does not need a JavaScript build step. GitHub changes are made on `main` for the existing automatic deployment.

To rebuild browser assets:

```sh
cd scripts
npm ci
npm run build
```

Build dependencies are pinned with a lockfile in `scripts/`. Source modules are in `assets/*-source.js`, with shared utilities in `assets/core.js`. They contain no server secrets. Do not manually edit the generated `assets/site.js` or `assets/admin.js` bundles.

## Checks

`tests/database-security.sql` runs transactional integration tests against the backend and rolls back all test records. It checks public editing and attendee access restrictions, untrusted metadata, server-calculated prices, forged paid flags, required answers, duplicate registration, capacity/waitlist behavior, and form snapshots.

`tests/ui.test.cjs` uses isolated API fixtures; it creates no real users, administrator accounts, payments, or customer records. It checks desktop/mobile navigation, help controls, price changes, the event form builder, payments configuration, public bookings, course/tuition totals, and custom registration answers. Install a Playwright Chromium browser before running `npm test` from `scripts/`, or set `CHROMIUM_PATH` to a compatible executable.

Content revisions can be restored in Activity & backups. JSON backups and filtered CSV exports are downloaded only by the owner. CSV exports neutralize spreadsheet formula prefixes. Exported registration files contain private contact information.
