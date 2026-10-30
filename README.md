# Wellness Connect

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
npm test          # 49 tests: matching, tenant isolation, auth, marketplace, professionals, admin, Connect
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
- Professional workspace (`/pro`): overview with a "get discovered" checklist, profile editor and search visibility, services (add, edit, pause; price ranges in rupees), credentials (upload, see review notes, resubmit), enquiry inbox (opening marks it viewed; decline), proposal form, proposals, bookings and earnings (agreed fees until payments go live). Public profile page `/p/<profileId>` with a Connect button; only verified, visible professionals in good standing are shown to others.
- Connect: connection requests, feed (own + connections + groups), likes, connection-gated messages, blocking.
- Append-only finance ledger and the payment table, ready for Razorpay.
- Screens: sign-in, sign-up, verify, forgot/reset password, two-factor, onboarding (company / professional / Connect), home, professional workspace, public profile, Connect feed and profile setup.

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
| Reports: remove reported posts/comments or dismiss | ✓ | ✓ |
| Audit log | ✓ | ✓ |

Every account also has **Account → security**: authenticator-app two-factor with backup codes, active sessions, and setting a password for Google/Microsoft accounts.

In production (`VERCEL_ENV=production`) the app refuses to start if `DATABASE_URL`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`, `RESEND_API_KEY` or `EMAIL_FROM` is missing, so emails can never silently fail.

## Next steps

1. M3: screens for the company flow (requirement form, matches, sending enquiries, comparing and accepting proposals); the APIs exist.
2. Razorpay orders + signed webhooks writing ledger entries.
3. Connect: network page, messages UI, groups, referrals.
4. Official Google/Microsoft sign-in buttons, PWA icons, privacy notice and consent records (DPDP).
