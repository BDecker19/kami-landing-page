/**
 * Returns public Supabase client config (anon key is safe to expose in browsers;
 * RLS still applies). Values come from Vercel env in production.
 */
module.exports = function supabasePublicHandler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.status(200).json({
    url: process.env.SUPABASE_URL || "https://bscnpilzmilzabagnypx.supabase.co",
    anonKey: process.env.SUPABASE_ANON_KEY || "",
  });
};
