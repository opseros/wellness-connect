# Moosam · Wellness Connect

Corporate wellness marketplace + free professional network.

- **Companies** post requirements, get rule-based matches with verified wellness professionals, compare proposals and book.
- **Wellness professionals** build a profile, get credentials verified, list services and answer enquiries.
- **Connect** is free for everyone: profiles, connections, posts, likes, groups, messages and referrals.

Phase 1 is web + installable PWA with no AI. The `/api/v1` REST API is what the Phase 2 Flutter app will use.

## Stack

| Layer | Choice |
|---|---|
| App + API | Next.js 16 (App Router, TypeScript) on **Vercel**, functions in Singapore (`sin1`) |
| Database | **Neon** Postgres, Singapore, via Drizzle ORM; row-level security for tenant data |
| Sign-in | Better Auth: **Google, Microsoft and email/password**, users stored in Neon |
| Email | Resend (printed to the server log when no key is set) |
| Files | Vercel Blob, **private** store, for credential documents |
| Background jobs | Transactional outbox, delivered right after each request; a daily Vercel Cron retries failures |
| Tests | Vitest + PGlite (in-memory Postgres, RLS enforced) |

## Run it locally

```bash
npm install
cp .env.example .env.local          # fill BETTER_AUTH_SECRET at least
# Database: either a Neon dev branch (put its URLs in .env.local) or local Docker:
docker compose up -d
#   DATABASE_URL=postgres://neondb_owner:localdev@localhost:5432/neondb
npm run db:migrate
npm run dev                          # http://localhost:3000
```

Without Resend configured, verification and reset links appear in the terminal running `npm run dev`.
Google/Microsoft buttons appear only when their keys are set.

```bash
npm test          # 109 tests: matching, tenant isolation, auth, company flow, payments, professionals, admin, Connect
npm run typecheck && npm run lint && npm run build
```

## Deploy (Vercel + Neon)

1. **Push this repo to GitHub** and import it in Vercel (framework: Next.js).
2. **Add Neon** from Vercel → Storage → Neon (or the Neon integration). Choose region **AWS Asia Pacific (Singapore)**.
   It sets `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`, and can create a database branch for every preview deployment.
3. **Add a Blob store** (Vercel → Storage → Blob), access **Private**. This sets `BLOB_READ_WRITE_TOKEN`.
4. **Set environment variables** from `.env.example`: `BETTER_AUTH_SECRET` (`openssl rand -base64 32`),
   `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` (your production URL), `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`.
5. **Google sign-in**: Google Cloud Console → Credentials → OAuth client ID (Web).
   Redirect URI `https://<your-domain>/api/auth/callback/google`.
6. **Microsoft sign-in**: Microsoft Entra → App registrations → New, "Accounts in any organizational directory and personal Microsoft accounts".
   Redirect URI (Web) `https://<your-domain>/api/auth/callback/microsoft`. Create a client secret.
7. **Deploy.** `vercel-build` runs `drizzle-kit migrate` before `next build`, so each deployment (and each Neon preview branch) gets the schema.
   `vercel.json` pins functions to Singapore and runs the outbox retry once a day (03:00 IST), which the Hobby plan allows.
   Emails are normally sent right after each action; the cron only retries failures. On Pro, change the schedule to `*/5 * * * *` for faster retries.
   Note: Vercel's Hobby plan is for non-commercial use, so move to Pro before real customers use it.
8. **Make yourself super admin**: set `SUPER_ADMIN_EMAILS=you@yourdomain.com` in Vercel and redeploy, then sign up
   (or sign in) with that email and verify it. Open **Admin**; you'll be asked to turn on two-factor first.
   Add more staff from **Admin → Users → Make ops staff**.

9. **Payments (Razorpay)**: Razorpay dashboard → Settings → API keys (start in **Test mode**) → set
   `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. Then Settings → Webhooks → add
   `https://wellcon.opseros.com/api/webhooks/razorpay` with a secret (set it as `RAZORPAY_WEBHOOK_SECRET`) and the
   events `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed`. Keep
   "auto-capture" on (Settings → Payment capture). Without keys, companies can still pay by invoice.
10. **Finance settings**: in `/admin/finance`, enter your legal name, GSTIN, registered address, state and bank
   details before issuing real invoices. Defaults: 10% commission, 18% GST on the session fee, no refund for late
   cancellations, 7-day invoice terms.

## Project layout

```
src/
  app/                    pages, server actions, /api/v1 route handlers, /api/auth, /api/cron
  modules/
    identity/             session helpers, sign-up hooks, auth tests
    organizations/        companies, memberships, email-domain join
    professionals/        profiles, credentials, services, verification review
    matching/             pure rule-based engine + DB loader (blueprint §6)
    marketplace/          requirements, enquiries, proposals, bookings (RLS-scoped)
    connect/              profiles, connections, posts, likes, messages, blocks
    platform/             outbox, audit log, event handlers
  db/schema/              Drizzle tables, one file per area
  lib/                    auth config, email, API helpers, errors
drizzle/                  SQL migrations (0001 adds RLS policies, ledger trigger, seed data)
```

## What's built

- Email/password with required email verification, 10-character minimum, breached-password check (production), rate limits, password reset that signs out every session; Google and Microsoft with safe account linking; optional TOTP two-factor (required for platform staff).
- Every account gets a Connect profile. Verified work emails request to join the company that owns the domain (public mail domains never do); owners and admins approve and assign roles.
- Marketplace: requirements → rule-based matching with hard filters and explained scores → enquiries to eligible professionals only → proposals → acceptance creating an idempotent booking, all inside row-level security.
- Credential upload to private storage and staff review with an audit trail. Without `BLOB_READ_WRITE_TOKEN` (local development only) files are kept in `./.data/uploads`.
- Company workspace (`/company/<orgId>`): dashboard (open requirements, proposals to review, upcoming sessions); requirement form with drafts and publishing; matches with a score breakdown, "why excluded" counts and a shortlist to send enquiries; enquiry tracking with reminders (once a day); side-by-side proposal comparison with accept and request-revision; bookings with location, reschedule (outside the free-cancellation window, at most twice), cancel (marked late inside the window) and mark completed; settings with company details (city, address, billing email, GSTIN), members and roles, join-request approval and email invitations (`/invite/<token>`, 14-day links, only a hash is stored). Requirements are private to the company and the professionals it contacts.
- Professional workspace (`/pro`): overview with a "get discovered" checklist, profile editor and search visibility, services (add, edit, pause; price ranges in rupees), credentials (upload, see review notes, resubmit), enquiry inbox (opening marks it viewed; decline), proposal form, proposals, bookings and earnings (agreed fees until payments go live). Public profile page `/p/<profileId>` with a Connect button; only verified, visible professionals in good standing are shown to others.
- Connect (`/connect`):
  - Network: invitations (accept/ignore), suggestions (shared topics and city), connections, sent requests, blocked members.
  - Member pages: limited view for non-connections, connect, follow, message, remove connection, block, report.
  - Feed: own posts, connections, people you follow and your groups; likes, comments (author or post owner can delete), reports.
  - Messages: conversation list with unread counts, threads that refresh every few seconds, nav badges. Only connections (or members who opened messages to everyone) can message; blocking hides the conversation and stops replies both ways.
  - Six spaces (wellness, travel, meet-ups, fitness, food, careers) as real groups, plus member-created communities (open or moderator-approved) with moderators who approve, decline, remove and promote.
  - Meet-ups: date, time (IST), place and city, with RSVP; listed for your network, your groups and your city.
  - Referrals between connected professionals with minimum information (phone numbers and emails are rejected), a status trail (sent → accepted/declined → completed, or withdrawn) and email notifications.
  - REST under `/api/v1/connect/*` for all of the above (members, follow, blocks, suggestions, conversations, comments, RSVP, meet-ups, groups and membership, referrals, reports, badges).
- Account types (M6): one login per person; companies, homestays and hospitals are organisations with members and roles. "Join as" (`/app/onboarding?as=member|pro|company|homestay|hospital`) at sign-up or later from Home.
  - Homestay and hospital workspaces (`/listing/<orgId>`): details (rooms, price from, recovery-friendly features; or specialties, accreditations, international desk, visa letters), photos, verification documents per checklist, team and invitations, submit for verification.
  - Documents are private (row-level security on `org_document`, private storage); staff opens are audited. Contact email and phone are for verification only.
  - Admin → Homestays & hospitals: per-type checklist that staff must tick to approve; request changes, reject or take down; owners emailed.
  - Public directories: `/professionals`, `/homestays`, `/hospitals` (and `/homestays/<slug>`, `/hospitals/<slug>`), verified listings only. Accreditations show only after staff checked the certificate. Photos are served by `/media/listing-photos/<id>` only for verified listings.
  - Home page tabs: Members, Professionals, Companies, Homestays, Hospitals, with real verified listings.
  - REST: `/api/v1/directory/*`, `/api/v1/listings`, `/api/v1/organizations/<orgId>/listing` (+ `/documents`, `/photos`, `/submit`), `/api/v1/admin/listings`.
- Homestay stays (M7, `src/modules/stays`, money in `src/modules/marketplace/stay-payments.ts`):
  - Host: calendar with per-date prices and blocked dates (`/listing/<orgId>/calendar`), cancellation policy (flexible, moderate, strict), minimum nights, check-in/out times; bookings page with requests to accept or decline, upcoming stays, host cancellation (full refund) and each stay's host share.
  - Guest: search homestays by dates, price and availability on the homestay page, request to book (reason for the stay and access needs; no medical details, no phone numbers or emails), pay online once the host accepts, "My stays" (`/stays`) with invoices and credit notes as PDFs, cancel with the refund shown first.
  - Timing: hosts answer within 48 hours; accepting holds the rooms for 48 hours (or until check-in) for the guest to pay; lapsed requests and holds expire (daily cron and on every view).
  - Money: room charges + GST by tariff per room per night (5% up to ₹7,500, 18% above, editable in Admin → Finance); place of supply is the property's state; invoices in their own series (`<prefix>S/2026-27/0001`); 12% commission from the host's share; refunds through Razorpay by policy; payouts to hosts after check-in, recorded by staff. A separate stay ledger reconciles to the paisa and is checked on Admin → Finance.
  - REST: `/api/v1/homestays/<orgId>/quote`, `/api/v1/homestays/<orgId>/stays`, `/api/v1/stays` (+ `/<id>`, `/cancel`, `/payment/order`, `/payment/verify`), `/api/v1/organizations/<orgId>/stays` (+ `/respond`, `/cancel`), `/api/v1/organizations/<orgId>/calendar`, `/api/v1/admin/stays/<stayId>/payouts`; `/api/v1/directory/homestays` takes `checkIn`, `checkOut`, `rooms`.
- Care & Travel (M8, `src/modules/care`):
  - Hospitals: treatment packages with indicative price ranges, what's included, nights in hospital and suggested recovery nights (`/listing/<orgId>/packages`); a quote-request desk (`/listing/<orgId>/requests`) to quote, ask for reports or decline. The patient stays anonymous to the hospital until they accept its quote.
  - Travellers: packages on hospital pages, "Request a quote" to up to three verified hospitals with only treatment, age range, country, month, companions, practical needs and a note (no phone numbers or emails); compare quotes side by side; accept one (the others are closed); optional reports.
  - Reports: encrypted with AES-256-GCM before storage (`REPORTS_ENCRYPTION_KEY`), shared per hospital only with recorded consent, every opening logged and shown to the traveller, unshared automatically from hospitals not chosen or that decline, deleted 90 days after the trip (180 days after upload without a trip) unless kept; the daily cron deletes them.
  - Care trip plan: travel dates, a day-by-day timeline from the quote, a checklist, the hospital desk's contact (after acceptance only), and a recovery stay: suggestions near the hospital and linking a homestay stay. Hosts never see anything medical.
  - Companies: Health check-ups page (`/company/<orgId>/health-checks`) to ask hospitals for quotes by headcount only; such requests can never carry reports.
  - Treatment is paid to the hospital directly; no money moves through the platform for it.
  - Switch: patient-facing requests and uploads are OFF in production until `CARE_TRAVEL=on` (after the M10 privacy work). Previews and development have it on.
  - REST: `/api/v1/care/requests` (+ `/<id>`, `/accept`, `/withdraw`, `/reports`), `/api/v1/care/reports/<id>` (+ `/shares`, `/keep`), `/api/v1/care/trips/<id>` (+ `/checklist`, `/stay`), `/api/v1/hospitals/<orgId>/packages`, `/api/v1/organizations/<orgId>/packages`, `/api/v1/organizations/<orgId>/care-quotes`, `/api/v1/organizations/<orgId>/health-checks`.
- Payments (`src/modules/marketplace/payments.ts`): each booking's price is fixed when it's accepted (session fee + 18% GST on the fee; 10% commission from the professional's share, overridable per category). Companies pay online with Razorpay Checkout (UPI, cards, net banking) or by invoice (bank transfer, marked paid by staff). Signed, idempotent webhooks; GST tax invoices and credit notes with financial-year numbering and PDFs; refunds by the cancellation policy (sent to Razorpay through the outbox with an idempotency key, or by bank transfer for invoice payments); manual payouts to professionals. An append-only ledger reconciles to the paisa: collected − refunded = GST + commission + professionals' share; `/admin/finance` checks it on every load.
- Home page (`/`): a professional network first. The hero's role choice ("I want to connect" or "I'm a wellness professional") changes the promise and where the new account goes after verifying (Connect profile or the professional set-up); join and sign-in sit in the same card. Companies, homestays and hospitals are in an "Also on" section. Dedicated `/sign-up` (`?as=pro`) and `/sign-in` pages share a split layout.
- Signed-in home (`/app`): "Use" (Connect, book a stay, Care & Travel) and "Offer" (professional profile, company, homestay or hospital you run).
- Screens: sign-in, sign-up, verify, forgot/reset password, two-factor, onboarding (company / professional / Connect), home, professional workspace, public profile, Connect (feed, network, member pages, messages, groups and spaces, meet-ups, referrals) and profile setup, Join as, homestay/hospital workspace, directories.

## Performance

- Loading screens in every section; menu links prefetch the full page on hover/touch/focus; recently visited pages are reused for 30 seconds (cleared by any save).
- Repeated reads within one page load (session, memberships, profiles, invitations) run once.
- Vercel functions run in `sin1`, next to Neon in Singapore (see `vercel.json`). On Neon's Free plan the database suspends after 5 idle minutes and takes a few hundred milliseconds to wake; a paid plan can turn scale to zero off.

## Admin portal (`/admin`)

Only `super_admin` and `ops` users with two-factor on can open it; everyone else gets a 404.

| Section | Ops | Super admin |
|---|---|---|
| Verification queue: view documents, approve, request info, reject (professional is emailed) | ✓ | ✓ |
| Users: search and view | ✓ | ✓ |
| Users: grant/remove ops, suspend/unsuspend (signs out everywhere, blocks sign-in) | | ✓ |
| Users: edit name/email (an email change must be re-verified and signs them out) | | ✓ |
| Users: remove an account (typed confirmation; personal details erased, sign-in blocked, bookings/payments/audit kept anonymously) | | ✓ |
| Organizations: view; link and verify company email domains | view | ✓ |
| Homestays & hospitals: verification checklist, approve, request changes, reject or take down | ✓ | ✓ |
| Reports: remove reported posts/comments, archive reported communities, or dismiss (reported members and conversations are named, messages stay private) | ✓ | ✓ |
| Finance: reconciliation, invoices, refunds, payments, amounts owed (sessions and stays) | view | ✓ |
| Finance: mark invoices paid, record bank refunds and payouts to professionals and hosts, settings and commission | | ✓ |
| Audit log | ✓ | ✓ |

Every account also has **Account → security**: authenticator-app two-factor with backup codes, active sessions, and setting a password for Google/Microsoft accounts.

In production (`VERCEL_ENV=production`) the app refuses to start if `DATABASE_URL`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `RESEND_API_KEY` or `EMAIL_FROM` is missing, so emails can never silently fail.

## Next steps

1. Before real payments: have your CA confirm the GST treatment (GST on the full session fee, SAC code, place of supply for companies without a GSTIN, TDS on payouts; for stays, the accommodation rates, SAC 996311 and whether the platform pays GST as an e-commerce operator under section 9(5)) and complete Razorpay KYC.
2. M9 notifications, installable app (PWA) and polish; then M10 privacy, security and launch readiness, after which Care & Travel can be switched on (see the Build Plan).
3. Official Google/Microsoft sign-in buttons, PWA icons, privacy notice and consent records (DPDP).
