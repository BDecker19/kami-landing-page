const { createClient } = require("@supabase/supabase-js");

function pickSupabaseUrl() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://bscnpilzmilzabagnypx.supabase.co";
  return String(url).trim().replace(/\/$/, "");
}

function isConfigured() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Persists a beta signup row when Supabase service role is configured.
 * Returns { ok: true } on insert or duplicate; { ok: false, error } on failure.
 */
async function storeBetaSignup(email, platform, source) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!serviceKey) {
    return { ok: true, skipped: true };
  }

  const admin = createClient(pickSupabaseUrl(), serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await admin.from("beta_signups").insert({
    email,
    platform,
    source,
  });

  if (!error) {
    return { ok: true };
  }

  // Unique violation — already captured.
  if (error.code === "23505") {
    return { ok: true, duplicate: true };
  }

  console.error("[beta-signup-store] insert failed", {
    code: error.code,
    message: error.message,
  });

  return {
    ok: false,
    error: "Could not save your signup. Please try again.",
  };
}

module.exports = {
  isConfigured,
  storeBetaSignup,
};
