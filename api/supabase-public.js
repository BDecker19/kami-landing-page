/**
 * Returns public Supabase client config (anon key is safe to expose in browsers;
 * RLS still applies). Values come from Vercel env in production.
 *
 * Scans several common env names and any SUPABASE*ANON* key so this project picks up
 * vars even if they were named for another stack (Vite/Expo/etc.).
 */
function looksLikeSupabaseUrl(v) {
  const s = String(v || "").trim();
  return /^https:\/\/.+\.supabase\.co\/?$/i.test(s);
}

function pickUrl() {
  const direct = [
    process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.PUBLIC_SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
  ];
  for (const v of direct) {
    if (looksLikeSupabaseUrl(v)) return String(v).trim().replace(/\/$/, "");
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (!v || !String(v).trim()) continue;
    const u = k.toUpperCase();
    if (u.includes("SERVICE")) continue;
    if (u.includes("SUPABASE") && u.includes("URL") && looksLikeSupabaseUrl(v)) return String(v).trim().replace(/\/$/, "");
  }
  return "https://bscnpilzmilzabagnypx.supabase.co";
}

function looksLikeSupabaseAnon(v) {
  const s = String(v || "").trim();
  if (!s || s.length < 20) return false;
  if (s.startsWith("sb_publishable_")) return true;
  if (s.startsWith("eyJ") && s.split(".").length === 3) return true;
  return false;
}

function pickAnon() {
  const direct = [
    process.env.SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.PUBLIC_SUPABASE_ANON_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ];
  for (const v of direct) {
    if (looksLikeSupabaseAnon(v)) return String(v).trim();
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (!looksLikeSupabaseAnon(v)) continue;
    const u = k.toUpperCase();
    if (u.includes("SERVICE")) continue;
    if (u.includes("SECRET") && !u.includes("ANON") && !u.includes("PUBLISHABLE")) continue;
    if (u.includes("SUPABASE") && (u.includes("ANON") || u.includes("PUBLISHABLE"))) return String(v).trim();
  }
  return "";
}

module.exports = function supabasePublicHandler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.status(200).json({
    url: pickUrl(),
    anonKey: pickAnon(),
  });
};
