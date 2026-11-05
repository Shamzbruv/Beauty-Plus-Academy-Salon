# Beauty Plus Academy & Salon

Website: https://beautyplusacademyandsalon.com

Owner and employee workspace: https://beautyplusacademyandsalon.com/admin/index.html

Store: https://beautyplusacademyandsalon.com/shop.html

The owner studio controls website pages, salon services and deposits, courses and kits, promotions, events and editable signup forms, gallery stories, products, inventory, delivery, employee access, invoices, verified payments, financial reporting, customer email templates, and notifications. Each workspace page has an information button. Public drafts remain private; catalog edits retain version checks and history.

## Start here

1. Sign in with the approved owner account, `forresterpetagay30@gmail.com`. Public signup or profile metadata cannot grant owner permissions.
2. Open **Store & booking settings**. Confirm Jamaica opening hours, working days, closures, overlapping appointment capacity, and checkout terms. Set a service's duration to control its occupied time.
3. Add products in **Products & inventory**. Set a unique SKU, optional barcode, public price, optional tax, private cost, inventory, photo, and publication status. Use separate products for sizes or colours. Archive items to preserve sale history.
4. Add pickup, delivery, and shipping choices in **Delivery & collection**. Each option has fees, covered areas, an optional free-delivery threshold, timing, and instructions. Existing orders retain their delivery snapshot.
5. Confirm your enabled methods and merchant links in **Payment methods**. Bank instructions, WiPay Jamaica, Fygaro, NCB hosted buttons, cash, and other hosted links are supported.
6. Configure customer email delivery as described below. Email templates, logos, colours, sender, reply-to address, and invoice footer are editable without code.
7. Add individual employee accounts in **Your employees**. Give POS, booking, and optional discount permissions. Share the temporary password privately. The employee changes it before accessing customer data. Resetting or disabling an account revokes its sessions; the owner cannot be modified as an employee.
8. On a supported browser, open **Your notifications** to install the admin app and enable push. iPhone/iPad users should first add the admin page to the Home Screen. Only the admin workspace is a PWA.

## POS, bookings, and invoices

The owner and permitted employees use the same POS: open a till with starting cash, search or scan products, add quantities, take cash/external card/bank or split payments, and save the sale. Cash change is calculated. Hold and resume baskets, close the till with counted cash, and use the receipt's print/PDF controls. Card entries record payments already taken on a separate terminal; this site never collects card numbers.

Stock, prices, taxes, delivery fees, discounts, invoices, and payments are calculated in database transactions. Overselling, incomplete tenders, and duplicate sale/refund requests cannot silently alter inventory. An unpaid online order reserves stock until fulfilled or cancelled. Cancelling an unpaid order restores it; paid returns use the owner's quantity-based refund flow, with an optional restock. Recording a refund does not move money at the bank/provider: complete that return there and record its reference here.

Customers and staff book from live availability. The server checks Jamaica opening hours, closures, service duration, salon capacity, and assigned employee conflicts. Every booking gets an invoice for its full service price, with the deposit requested separately. Confirming a booking and verifying its payment are separate actions. Quotes for variable-price services need owner follow-up.

Course enrollment creates an invoice for the chosen course/kit plus registration. Students open **Make a tuition payment** on their private enrollment invoice to continue against the same balance. The tuition form also accepts that invoice link/code; knowing a student's email alone cannot expose the invoice. Each payment is verified against the original invoice rather than counted as a second course sale.

**Invoices & payments** supports printing, local PDF downloads, verified partial payments, and owner refunds. A customer's receipt/reference or return from a payment page never marks an invoice paid. Verify the transaction in your bank/provider first. Payment records are append-only; corrections are made through refunds, not by changing a paid flag.

**Financial overview** shows received payments, refunds, net income, outstanding balances, daily trends, booking/course/store breakdowns, payment methods, staff POS sales, product performance, and a transaction export. Dates use Jamaica time. Outstanding covers all open invoices; product margins are estimates before discounts and business overheads. These are operational reports, not a general accounting or tax filing system.

## Customer email setup

**Real delivery needs the owner's Resend API key and a verified sender domain.** No provider key is committed or preloaded. Until configured, invoices remain available on screen and messages stay visible in the delivery log; the app does not claim they were emailed.

1. Create or use the salon's [Resend account](https://resend.com/), add the sending domain, and complete its DNS verification.
2. In **Emails & branding → Branding**, save a sender address on that verified domain, a sender name, reply-to address, and optional email/invoice logos and colours.
3. In **Emails & branding → Delivery setup**, paste the Resend sending API key. It is stored privately on the server and is never returned to the browser.
4. Preview and edit booking, course, store, payment receipt, refund, and update templates. Toggle a template off to suppress it. Template text is escaped; placeholders are listed in the editor.
5. Check the delivery log. It distinguishes queued, processing, sent/provider accepted, blocked, skipped, and failed messages. Use retry after correcting a sender/provider problem. Provider acceptance does not guarantee arrival in an inbox.

Emails include the branded invoice PDF and private invoice link. Worker jobs use leases, retries, stable payload snapshots, and provider idempotency. Disabled templates are skipped. In-app alerts and permitted browser push cover bookings, store activity, courses, events, and low stock; delivery depends on device permissions and connectivity.

Supabase authentication emails (such as owner password recovery) use Supabase Auth's separate email settings. Business template changes do not alter those system messages. Employees use owner-issued temporary passwords and may change their password inside the workspace.

## Payment providers

- **WiPay Jamaica:** the existing merchant account is retained. Update the account/fee setting or use a hosted payment link. Checkout opens the provider's payment page with the server-calculated amount.
- **Fygaro and NCB Payment Buttons:** use approved merchant-hosted links. Item-specific links must be updated when the catalog price changes; general links must support the intended amount.
- **Bank transfer:** verify the imported bank details before accepting transfers. Edit instructions in Payment methods.
- **Cash and other hosted links:** enable the available choices in Payment methods. Merchant approval and fees are handled by providers.

Setup links and instructions are also in the dashboard. Provider return URLs are not trusted payment notifications. Promotions and optional promotion codes advertise offers; they do not automatically calculate website discounts. POS discounts require the owner's permission.

## Backend and access

`assets/config.js` contains only the Supabase URL and public publishable key. Public tables use RLS and explicit grants. Owner checks require a verified Supabase Auth identity on `bp_admins`. Employee checks require an active permitted account, completed password setup, and a current server session. Staff cannot access owner finances, product costs, email configuration, or academy records. Invoice links are private capabilities; do not publish them.

Privileged account and delivery operations run in the `bp-business` Edge Function. JWT verification stays enabled. Its service client can execute only the narrow server commands it needs; secrets live in `bp_private.runtime_config` and function environment variables. The worker's internal authorization and Web Push VAPID keys are server-only. The first authenticated function request initializes the worker gateway internally. Cron retries delivery each minute; database events also wake it immediately.

Migrations in `supabase/migrations/` have been applied to the configured project. Do not rerun the initial schema/seed on the same database. `supabase/seed-content.json` contains the original imported content. The `bp-media` public bucket allows owner image uploads up to 10 MB; do not place private documents there.

The admin service worker caches only the workspace shell/assets. Customer records, Supabase APIs, passwords, and payment operations are not cached. Checkout requires a connection. Signing out clears the active workspace and removes that browser's push subscription.

## Hosting and development

The existing PHP entrypoint is retained. Commit browser bundles to GitHub `main` so the existing Railway automatic deployment serves them; no direct Railway edits are needed. Production does not require a JavaScript build.

```sh
cd scripts
npm ci
npm run build
npm test
```

Source modules are under `assets/`; `scripts/build.cjs` generates `site.js`, `admin.js`, and `invoice.js`. Do not edit bundles by hand. The shared invoice/email renderers are mirrored under `supabase/functions/_shared/`; keep these copies synchronized. The PDF includes embedded DejaVu Sans subsets with their license in `assets/invoice-fonts-LICENSE.txt`.

Deploy `bp-business` with the Supabase Management API or CLI using `supabase/config.toml`; preserve `verify_jwt = true`. It expects automatically injected Supabase credentials plus `BP_WORKER_KEY`, `BP_VAPID_PUBLIC`, and `BP_VAPID_PRIVATE`. The matching internal worker URL/token are stored privately in the database, never in browser configuration. The owner's Resend key is entered through the studio.

## Verification

`tests/database-security.sql` checks public edits, private attendee access, trusted identity, server pricing, paid-flag forgery, event capacity/waitlists, required answers, and form snapshots. `tests/commerce-security.sql` adds atomic stock/tenders/refunds, idempotency, invoice access, employee permission/deactivation, real appointment availability, booking deposits, capability-protected course balances, delivery coverage, and cancellation tests. They use transaction-only fixtures and roll back all records; they create no persistent test accounts or emails.

`tests/business-worker.test.cjs` checks employee/owner authorization, missing-provider blocking, escaped branding, PDF attachment generation, persistent snapshots, and provider retry idempotency using isolated clients and a mocked provider.

`tests/ui.test.cjs` uses isolated API fixtures for owner/staff navigation, help, existing CMS features, public forms, products, POS cash/change, finance graphs, employee setup, email setup, the store, and invoice PDF downloads on desktop/mobile. Set `CHROMIUM_PATH` to a compatible Chromium executable when needed. No real payment, user account, or customer message is created by these browser tests.

Content backups and CSV exports remain owner-only. Exports neutralize spreadsheet formula prefixes and may contain private contact information; store them appropriately.
