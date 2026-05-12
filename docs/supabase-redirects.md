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

The reset page loads the **public anon key** from **`/api/supabase-public`** (Vercel env) **or**, if that returns an empty key, from **`assets/supabase-browser-public.js`** (`window.__KAMI_BROWSER_SUPABASE__.anonKey`).

In **Vercel → the project that deploys this GitHub repo** (`kami-landing-page`), set:

| Name | Value |
|------|--------|
| **`SUPABASE_ANON_KEY`** or **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** (and other names; see `api/supabase-public.js`) | Supabase **Settings → API → Project API keys → anon public** |
| **`SUPABASE_URL`** or **`NEXT_PUBLIC_SUPABASE_URL`** | Optional. Defaults to `https://bscnpilzmilzabagnypx.supabase.co` if unset. |

**Important:** Environment variables are **per Vercel project**. Keys that exist only on another project (for example your main Next.js app) **will not** be available to `/api/supabase-public` here. Either duplicate **`SUPABASE_ANON_KEY`** on this project or paste the anon string into **`assets/supabase-browser-public.js`** and redeploy.

Redeploy after changing env vars.

### Fallback file

`assets/supabase-browser-public.js` can hold the same anon public key (safe to commit; RLS still applies). The page tries the API first, then uses this file if the API returns an empty `anonKey`.

### Behavior (web reset)

- Supabase typically appends session parameters in the **URL hash** (`#access_token=…&refresh_token=…&type=recovery`) or, depending on flow, in the **query string**.
- The page calls **`setSession`** with those tokens, clears the hash/query from the address bar, then (if the account uses MFA) asks for a **TOTP or SMS** code so the session reaches **AAL2**, then lets the user set a new password with **`updateUser({ password })`**.
- Tokens are not logged, shown, or sent to analytics. The address bar is cleaned only **after** a session exchange attempt.

### Ops checklist

1. Allow **`https://kamisocial.com/password-reset`** in Supabase redirect allowlist (and `www` if you use it).
2. On **this** Vercel project, set **`SUPABASE_ANON_KEY`** (or use `assets/supabase-browser-public.js`) and redeploy.
3. (Optional) Point **`redirectTo`** at **`/password-reset`** so users skip the homepage hop.
