# Supabase auth redirects (public site)

## Password recovery

Configure Supabase **email recovery** / **password reset** so the browser lands on this site path:

**`https://kamisocial.com/password-reset`**

Add that URL under **Authentication → URL configuration** (or your project’s equivalent) as an allowed **Redirect URL** / site URL pattern Supabase accepts for recovery links.

### Why links sometimes open `kamisocial.com/#…` instead

Supabase often sends users to whatever **Site URL** is set to (for example `https://kamisocial.com`), then appends the session in the **hash**. If your **Site URL** is the apex homepage, you will see `https://kamisocial.com/#access_token=…` even though you also allow `/password-reset`.

To land **directly** on the handoff page, set the recovery flow’s **redirect** to `https://kamisocial.com/password-reset` everywhere it is controlled:

- **Authentication → URL configuration**: add **`https://kamisocial.com/password-reset`** to **Redirect URLs** (required allowlist).
- **Site URL**: if it must stay the marketing homepage, ensure the **Reset password** email template and/or your `resetPasswordForEmail` / GoTrue call passes **`redirectTo: 'https://kamisocial.com/password-reset'`** (or the equivalent in your app). Otherwise Supabase will keep using the Site URL as the default redirect target.

The marketing homepage also forwards a Supabase **recovery** hash (or query) to **`/password-reset`** without logging tokens, so misconfigured redirects still reach the app handoff.

### Behavior

- Supabase typically appends session parameters in the **URL hash** (`#access_token=…&refresh_token=…&type=recovery`) or, depending on flow, in the **query string**. The hosted page attempts to open the native app at `kami://password-reset` while preserving the same hash or query payload so the app can complete the reset.
- Tokens are not logged, shown, or sent to analytics from this page. The address bar is cleaned only **after** an app handoff attempt (or immediately when the link does not contain a valid recovery payload).

### Ops checklist

1. Allow **`https://kamisocial.com/password-reset`** in Supabase redirect allowlist (and keep it in sync with production).
2. Ensure the mobile app registers **`kami://password-reset`** and consumes the same token payload shape Supabase sends to the web URL.
