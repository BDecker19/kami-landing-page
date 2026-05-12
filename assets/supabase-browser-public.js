/**
 * Optional fallback: Supabase **anon (public)** key for the password-reset page.
 * Safe to commit — it only works together with your RLS policies.
 *
 * Use this if `/api/supabase-public` stays empty (e.g. env vars live on a *different*
 * Vercel project than this static site). Paste the anon key from:
 * Supabase Dashboard → Settings → API → Project API keys → anon public
 */
window.__KAMI_BROWSER_SUPABASE__ = {
  url: "https://bscnpilzmilzabagnypx.supabase.co",
  anonKey: "sb_publishable_KZjXdTtB1w5nm1to8f2MXA_Pg0JbiU6",
};
