# Supabase auth redirects (public site)

## Password recovery

Configure Supabase **email recovery** / **password reset** so the browser lands on this site path:

**`https://kamisocial.com/password-reset`**

Add that URL under **Authentication → URL configuration** (or your project’s equivalent) as an allowed **Redirect URL** / site URL pattern Supabase accepts for recovery links.

### Why links sometimes open `kamisocial.com/#…` instead

Supabase often sends users to whatever **Site URL** is set to (for example `https://kamisocial.com`), then appends the session in the **hash**. If your **Site URL** is the apex homepage, you will see `https://kamisocial.com/#access_token=…` even though you also allow `/password-reset`.

To land **directly** on the reset page, set the recovery flow’s **redirect** to `https://kamisocial.com/password-reset` everywhere it is controlled:

- **Authentication → URL configuration**: add **`https://kamisocial.com/password-reset`** to **Redirect URLs** (required allowlist).
- **Site URL**: if it must stay the marketing homepage, ensure the **Reset password** email template and/or your `resetPasswordForEmail` / GoTrue call passes **`redirectTo: 'https://kamisocial.com/password-reset'`** (or the equivalent in your app). Otherwise Supabase will keep using the Site URL as the default redirect target.

The marketing homepage also forwards a Supabase **recovery** hash (or query) to **`/password-reset`** without logging tokens, so misconfigured redirects still reach the reset page.

### Vercel (password reset page)

The reset page loads the **public anon key** from a small serverless route so it is not committed to git.

In **Vercel → Project → Settings → Environment Variables** (Production / Preview as needed), set:

| Name | Value |
|------|--------|
| **`SUPABASE_ANON_KEY`** or **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** | From Supabase **Settings → API → Project API keys → anon public** (either variable name works) |
| **`SUPABASE_URL`** or **`NEXT_PUBLIC_SUPABASE_URL`** | Optional. Defaults to `https://bscnpilzmilzabagnypx.supabase.co` if unset. |

Redeploy after changing env vars.

### Behavior (web reset)

- Supabase typically appends session parameters in the **URL hash** (`#access_token=…&refresh_token=…&type=recovery`) or, depending on flow, in the **query string**.
- The page calls **`setSession`** with those tokens, clears the hash/query from the address bar, then lets the user set a new password with **`updateUser({ password })`** in the browser.
- Tokens are not logged, shown, or sent to analytics. The address bar is cleaned only **after** a session exchange attempt.

### Ops checklist

1. Allow **`https://kamisocial.com/password-reset`** in Supabase redirect allowlist (and `www` if you use it).
2. Set **`SUPABASE_ANON_KEY`** on Vercel and redeploy.
3. (Optional) Point **`redirectTo`** at **`/password-reset`** so users skip the homepage hop.
