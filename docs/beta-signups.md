# Beta signups

Website beta signup capture for Android and iOS download forms. Handlers live in Vercel serverless functions under `api/beta/`. Credentials (Supabase service role, Google Workspace, Resend) never reach the browser.

## Android (implemented)

**Endpoint:** `POST /api/beta/android`

**Request body:**

```json
{
  "email": "user@example.com",
  "source": "website"
}
```

**Flow:**

1. Validate HTTP method and rate-limit by IP and email.
2. Validate and normalize email (lowercase).
3. Insert into Supabase `beta_signups` when `SUPABASE_SERVICE_ROLE_KEY` is configured (skipped if not). Storage failures are logged but do not block step 4.
4. Add member to the internal Android beta Google Group via Admin SDK (`GOOGLE_ANDROID_BETA_GROUP_EMAIL`, default `android-beta@kamisocial.com`). Duplicate membership is treated as success.
5. Send the user a beta confirmation email via Resend (when configured). Failures are logged but do not fail the signup.
6. Send an internal notification email to `hello@kamisocial.com` via Resend (when configured). Failures are logged but do not fail the signup.
7. Return JSON `{ success: true, message: "You're in. Check your email for the Google Play beta link." }`.

**Setup:** See [google-admin-android-beta-setup.md](./google-admin-android-beta-setup.md).

**Security:** The Google Group address and Play Console mechanics are internal only. Do not reference them in user-facing UI or API responses.

## iOS (implemented)

**Endpoint:** `POST /api/beta/ios`

**Request body:**

```json
{
  "email": "user@example.com",
  "source": "website"
}
```

**Flow:**

1. Validate HTTP method and rate-limit by IP and email.
2. Validate and normalize email (lowercase).
3. Insert into Supabase `beta_signups` with `platform = ios` when `SUPABASE_SERVICE_ROLE_KEY` is configured (skipped if not). Storage failures are logged but do not block emails.
4. Treat duplicate email + platform as success (idempotent).
5. Send the user a beta confirmation email via Resend (when configured). If `IOS_TESTFLIGHT_LINK` is unset or still a TODO placeholder, the email uses waitlist copy without a TestFlight button.
6. Send an internal notification email to `hello@kamisocial.com` via Resend (when configured).
7. Return JSON `{ success: true, message: "You're in. Check your email for the TestFlight link." }`.

Repeat signups for the same email/platform may resend confirmation and internal emails but still return success.

## Supabase table

Migration: `supabase/migrations/20260611150000_beta_signups.sql`

| Field        | Type        | Notes                                      |
| ------------ | ----------- | ------------------------------------------ |
| `id`         | uuid        | Primary key                                |
| `email`      | text        | Normalized (trimmed, lowercased) on insert |
| `platform`   | text        | `android` or `ios`                         |
| `source`     | text        | Default `website`                          |
| `created_at` | timestamptz | Server default `now()`                     |

**Unique constraint:** `(lower(trim(email)), platform)` — repeat signups for the same email/platform do not create duplicate rows.

**Storage helper metadata** (`api/lib/beta-signup-store.js`):

| Field       | Meaning                                      |
| ----------- | -------------------------------------------- |
| `stored`    | Row exists or was inserted                   |
| `inserted`  | New row inserted on this request             |
| `duplicate` | Unique violation — already captured          |
| `skipped`   | No service role key configured               |
| `errorCode` | Supabase error code on non-duplicate failure |

If `SUPABASE_SERVICE_ROLE_KEY` is not set, storage is skipped and signup proceeds. If it is set but insert fails (other than duplicate email), the failure is logged and signup still proceeds (Android: to Google Group add; iOS: to emails).

## Confirmation emails

**Helper:** `api/lib/beta-confirmation-email.js`

| Item    | Value |
| ------- | ----- |
| Subject | Welcome to the Kami Beta |
| From    | `Benji from Kami <benji@mail.kamisocial.com>` |
| Reply   | `hello@kamisocial.com` |

**Android:** Title “Welcome to the Kami Android Beta”, CTA “Open on Google Play” using `ANDROID_PLAY_TEST_LINK` (fallback: Play Store listing for `com.kamisocial.app`).

**iOS:** Title “Welcome to the Kami iOS Beta”. When `IOS_TESTFLIGHT_LINK` is configured, CTA “Open in TestFlight”. Otherwise waitlist copy without a CTA button.

Requires `RESEND_API_KEY`. Send failures are logged only.

## Internal notification emails

**Helper:** `api/lib/beta-internal-notification.js`

| Item       | Value |
| ---------- | ----- |
| To         | `hello@kamisocial.com` |
| Subject    | `New Android Beta Signup` or `New iOS Beta Signup` |
| Body       | Plain text: email, platform, source, request timestamp, Supabase storage result, Android group add result (Android only), confirmation email send result |

Requires `RESEND_API_KEY`. Send failures are logged only.

## Environment variables

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `GOOGLE_WORKSPACE_CLIENT_EMAIL` | Android | Service account email |
| `GOOGLE_WORKSPACE_PRIVATE_KEY` | Android | Service account PEM key |
| `GOOGLE_WORKSPACE_IMPERSONATED_ADMIN_EMAIL` | Android | Admin user to impersonate |
| `GOOGLE_ANDROID_BETA_GROUP_EMAIL` | No | Default `android-beta@kamisocial.com` |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Persist signups |
| `SUPABASE_URL` | No | Supabase project URL |
| `RESEND_API_KEY` | No | Confirmation + internal notification emails |
| `ANDROID_PLAY_TEST_LINK` | No | Play beta/testing URL in confirmation email |
| `IOS_TESTFLIGHT_LINK` | No | TestFlight URL in confirmation email; omit CTA if unset/TODO |

Do not commit secrets. Set these in the Vercel project (Production + Preview as needed) or a gitignored local `.env` for `npx vercel dev`.

## Frontend

**Download section:** `index.html#download`

| Mode | Behavior |
| ---- | -------- |
| `localhost` / `127.0.0.1` | Mock signup (no API call) for static `npm run dev` |
| Production / `npx vercel dev` | `POST /api/beta/android` and `POST /api/beta/ios` |

Inline errors only; no browser alerts. Do not expose Google Group details in UI.

## Local testing

Static `npm run dev` (`npx serve`) does **not** run API routes. Use Vercel local dev:

```sh
npm ci
npx vercel dev
```

Add env vars to a gitignored `.env` or `.env.local` as needed.

**Android:**

```sh
curl -X POST http://localhost:3000/api/beta/android \
  -H "Content-Type: application/json" \
  -d '{"email":"test-android@example.com","source":"website"}'
```

Expected: validates email, stores or idempotently accepts signup, adds to Google Group when configured, sends confirmation + internal emails when Resend is configured, returns `{ success: true, ... }`.

**iOS:**

```sh
curl -X POST http://localhost:3000/api/beta/ios \
  -H "Content-Type: application/json" \
  -d '{"email":"test-ios@example.com","source":"website"}'
```

Expected: validates email, stores or idempotently accepts signup, sends confirmation + internal emails when Resend is configured, returns `{ success: true, ... }`.

**Frontend:** open `http://localhost:3000/index.html#download` with mock mode (static serve) or real endpoints (`vercel dev`).

## Production testing checklist

- [ ] `POST /api/beta/android` returns success for a new email
- [ ] Repeat Android signup for same email returns success (idempotent)
- [ ] New Android signup appears in `beta_signups` (when service role configured)
- [ ] Android signup is added to the internal Google Group (when Google env configured)
- [ ] Android user receives confirmation email with Play link (when Resend configured)
- [ ] `POST /api/beta/ios` returns success for a new email
- [ ] Repeat iOS signup for same email returns success (idempotent)
- [ ] New iOS signup appears in `beta_signups` (when service role configured)
- [ ] iOS user receives confirmation email (TestFlight CTA or waitlist copy)
- [ ] Internal notification arrives at `hello@kamisocial.com` for both platforms
- [ ] No Google Group address or Play Console mechanics visible in user-facing UI or API responses

## Security

- Never expose Google, Supabase service, or Resend credentials in the static site.
- Do not reference Google Groups or Play Console mechanics in user-facing copy.
- The Google Group address is internal and must never appear in user-facing UI.
