# Ambassador portal backend

The public ambassador portal at `/ambassador` uses Supabase Auth plus self-service RPCs. The landing-page repo ships the migration and UI; the shared Kami Supabase project hosts the data and functions.

## Deploy checklist

1. Apply migration `supabase/migrations/20260611180000_ambassador_portal.sql` to the Kami Supabase project (if not already applied).
2. On the **kami-landing-page** Vercel project, set:
   - `SUPABASE_ANON_KEY` (or use `assets/supabase-browser-public.js`)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only; used by `/api/ambassador/*` to verify JWTs and send welcome email)
   - `RESEND_API_KEY` (server-only; ambassador welcome email via Resend)
   - `AMBASSADOR_WELCOME_EMAIL_SEND_ENABLED=true` (optional; defaults to enabled)
   - `SUPABASE_URL` (optional; defaults to production project URL)
3. Redeploy after env changes.
4. Add `https://kamisocial.com/ambassador` to Supabase Auth redirect URLs if password reset is used from this page.

## RPCs (authenticated)

| RPC | Purpose |
|-----|---------|
| `get_my_ambassador_agreement_status` | Returns `not_ambassador`, `agreement_required`, or `dashboard` |
| `get_my_ambassador_dashboard` | Header, referral link, metrics, program parameters |
| `get_my_ambassador_referrals` | Referral list (limited public fields) |
| `get_my_ambassador_payout_history` | Payout records from `ambassador_payments` |
| `get_my_ambassador_change_ledger` | Audit events from `ambassador_audit_events` |
| `get_my_ambassador_agreement_history` | Stored agreement + parameter snapshots |
| `accept_my_ambassador_agreement` | Stores full agreement snapshot + program parameter snapshot |
| `terminate_my_ambassador_participation` | Self-service leave (requires confirmation `LEAVE`) |

All RPCs resolve the app user via `users.auth_user_id = auth.uid()` and never expose other ambassadors' data.

## New tables

### `ambassador_program_settings`

Singleton-style active row for live program copy shown before acceptance and on the dashboard:

- `qualification_requirements`, `compensation_rate`, `bonus_opportunities`
- `monthly_earnings_limit`, `payout_threshold`, `payout_schedule`
- `current_agreement_version` (e.g. `ambassador_terms_v1`)
- `last_updated`

Admins should update this table (or a future admin UI) when program economics change. Dashboard values are authoritative at display time.

### `ambassador_agreement_acceptances`

Immutable acceptance records:

- `agreement_version`, `agreement_snapshot` (full text at acceptance)
- `program_parameters_snapshot` (JSON shown at acceptance)
- `accepted_at`, `accepted_by_auth_user_id`
- optional `ip_address`, `user_agent`

RLS enabled with no direct client policies — access only through RPCs.

## Agreement versioning

Current agreement text lives in `assets/ambassador/agreements/`. When legal publishes a new version:

1. Add `ambassador_terms_v2.js` (or similar).
2. Register it in `assets/ambassador/agreements/index.js`.
3. Set `ambassador_program_settings.current_agreement_version` to the new version.
4. Ambassadors without an acceptance for that version see the agreement flow again; dashboard RPCs return `dashboard_locked` until accepted.

## Reused existing backend

- `ambassador_profiles` — status, rates, caps, earnings totals
- `ambassador_payments` — payout history
- `ambassador_audit_events` — change ledger
- `promotion_links` — referral codes (`link_type = user_referral`)
- `referral_attributions` + `bounty_ledger_entries` — referrals and earnings
- `user_profiles` — ambassador/referred display names and avatars (no profile links in UI)

## API routes (Vercel)

| Route | Notes |
|-------|------|
| `POST /api/ambassador/forgot-password` | Validates email is an approved ambassador, then sends reset link; returns `email_sent`, `email_not_found`, or `not_ambassador` |
| `POST /api/ambassador/accept-agreement` | Forwards to RPC; captures IP + User-Agent; sends first-time ambassador welcome email (non-blocking) |
| `POST /api/ambassador/terminate` | Forwards to RPC with typed confirmation |

## Ambassador welcome email

On **first** agreement acceptance only:

1. `accept_my_ambassador_agreement` returns `first_agreement_acceptance: true`.
2. `/api/ambassador/accept-agreement` sends the welcome email via Resend (server-side).
3. Idempotency: `ambassador_profiles.welcome_email_sent_at` + unique `email_delivery_log` row per `(recipient_user_id, email_type='ambassador_welcome')`.
4. Agreement acceptance still succeeds if email send fails; failures are logged to `email_delivery_log`.

Admin preview: **Emails → Ambassador Welcome** in the Kami admin console.

Sender: **Benji from Kami** via `benji@mail.kamisocial.com` (verified Resend domain); reply-to `benji@kamisocial.com`.

Test send locally (requires `RESEND_API_KEY`):

```bash
RESEND_API_KEY=... node scripts/send-ambassador-welcome-test.js benji@kamisocial.com Benji
```

Or via Supabase edge function (uses project `RESEND_API_KEY` secret):

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/test-ambassador-welcome-email" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"benji@kamisocial.com","first_name":"Benji"}'
```

## Known gaps / follow-ups

- **Email on self-termination**: RPC deactivates participation and writes audit event; transactional email is not yet wired from this repo.
- **Payout period detail**: `ambassador_payments` may not include qualified-referral counts per period; dashboard shows amounts and dates.
- **Admin editing**: Program settings are seeded in migration; add admin tooling in the app/admin repo to edit `ambassador_program_settings` without SQL.
- **Legal review**: Agreement text in `ambassador_terms_v1.js` should be confirmed by product/legal before launch.

## Security

- No service role key in the browser.
- Browser calls read RPCs with the user session; write actions go through API routes that verify JWT then call RPCs with the same JWT.
- Direct table access remains admin-only via existing RLS.
