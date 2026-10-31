# Rules for AI coding assistants (and humans)

@AGENTS.md

Moosam (tagline "Wellness Connect"): corporate wellness marketplace + free professional network ("Connect").
The product name and tagline live in `src/lib/brand.ts`; never hard-code them.
One Next.js 16 app on Vercel, Postgres on Neon (Singapore), Drizzle ORM, Better Auth.
Read README.md for the product and setup. These rules are not optional.

## Architecture: a modular monolith
- Business logic lives ONLY in `src/modules/<module>/service.ts`. Route handlers
  (`src/app/api/v1/**/route.ts`), server actions and pages are thin: check the user,
  parse input with the module's Zod schema, call a service, return the result.
- Pages never import `@/db/client` or `@/db/schema`. Ask a service.
- A module may call another module's exported service functions, never its tables.
  Exceptions: everyone may read `user`; `matching` is a read model over professionals,
  catalogue and requirements.
- REST under `/api/v1` is the contract the Phase 2 Flutter app will reuse. Don't put
  business rules only in server actions or only in the UI. Don't break `/api/v1` shapes;
  add `/api/v2` if you must.

## Security: tenant isolation and auth
- Marketplace tables (`requirement`, `enquiry`, `proposal`, `booking`, `payment`,
  `ledger_entry`) have Postgres row-level security with FORCE. Every query on them MUST
  run inside `withScope({ userId, orgId }, tx => ...)` from `@/db/client`.
  Never call `getDb()` directly for those tables.
- `bypass: true` is only for the outbox worker, verified payment webhooks and audited
  platform-staff actions.
- Always check roles with `requireOrgRole(...)` inside the same scoped transaction.
  RLS is the safety net, not the only check.
- New tenant-owned table? Add `org_id`, enable + FORCE RLS with a policy in a migration,
  and add a case to `src/modules/marketplace/tenant-isolation.test.ts`.
- Use `requireUser()` (signed in AND email verified) in every route/action.
  Admin tools use `requirePlatformStaff()` (staff role AND two-factor on).
- Never let sign-up or profile input set `platformRole`, `emailVerified` or roles.
- Admin features live in `src/modules/admin/service.ts`; every function takes the acting
  staff member and calls `assertStaff` / `assertSuperAdmin` itself, and audits changes.
  Admin pages use `getStaffOrExit()` (404 for non-staff). Don't add admin logic elsewhere.
- Files: use `src/lib/storage.ts` (private Vercel Blob, local folder in development). Never
  make an upload public; staff open documents through an audited route.
- Users are never hard-deleted: `removeUser` anonymises the row (`deleted_at`) so bookings,
  payments and the audit trail keep their references. Suspended or removed users can't
  sign in, aren't matched and have no public profile.
- Don't collect individual employee health information. Referrals and messages carry
  the minimum needed. Keep the "no health details" copy in the UI.

## Money
- Integer paise + ISO currency code. Never floats for stored money.
- `ledger_entry` is append-only (a trigger blocks UPDATE/DELETE). Correct with a
  reversal row.
- Payment and booking operations take an idempotency key.
- Verify Razorpay webhook signatures before trusting them. Never store card data.
- All money movement lives in `src/modules/marketplace/payments.ts` (read its header for the
  model and ledger sign conventions). Every change must keep the reconciliation true:
  Σgross − Σrefund − Σreversal = Σtax + Σplatform_commission + Σprovider_payable.
- Never call Razorpay inside a database transaction except from the outbox worker; refunds
  go through the `refund.requested` outbox event with our refund id as idempotency key.

## Side effects
- Emails/notifications go through the outbox: `enqueue(tx, event)` in the SAME
  transaction as the change. Delivery starts right after the response (Next.js `after`);
  `/api/cron/outbox` (daily on Hobby) retries failures.
- Auth emails (verify, reset) are the exception and are sent directly by Better Auth.
  Company invitations are also sent directly, because the outbox must never store the
  raw invitation token (only its SHA-256 hash is saved).

## Database changes
- Edit `src/db/schema/*.ts`, then `npm run db:generate` to create a migration. Never
  hand-edit generated SQL; never change the database outside migrations.
- SQL the schema can't express (RLS, triggers, seeds) goes in a custom migration:
  `npx drizzle-kit generate --custom --name <what>`.
- Migrations already applied in production are immutable: fix forward.

## Before you say you're done
- `npm run typecheck && npm run lint && npm test && npm run build` all pass.
- New business rule = new test. Tests use PGlite (in-memory Postgres) as a
  non-superuser, so RLS is really enforced; see `src/test/db.ts`.
- Payments, auth, RLS policies and migrations get a human review every time.

## Next.js 16 notes
- Middleware is now `proxy.ts`. Route params are Promises: `const { id } = await ctx.params`.
- Cache Components is OFF (see next.config.ts). Pages are dynamic; `getCurrentUser()`
  reads headers first so builds never touch the database.
