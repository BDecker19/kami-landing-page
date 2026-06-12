const { createClient } = require("@supabase/supabase-js");

function pickSupabaseUrl() {
  const u =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://bscnpilzmilzabagnypx.supabase.co";
  return String(u).trim().replace(/\/$/, "");
}

function pickAnonKey() {
  return (
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ""
  );
}

function pickServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function bearerToken(req) {
  const authHeader = req.headers.authorization || "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function createUserClient(userJwt) {
  const url = pickSupabaseUrl();
  const anonKey = pickAnonKey();
  if (!anonKey) {
    throw new Error("missing_anon_key");
  }
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${userJwt}`,
      },
    },
  });
}

function createAdminClient() {
  const url = pickSupabaseUrl();
  const serviceKey = pickServiceKey();
  if (!serviceKey) {
    throw new Error("missing_service_role");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function verifyUserJwt(userJwt) {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.getUser(userJwt);
    if (error || !data?.user?.id) return null;
    return data.user;
  } catch (_e) {
    return null;
  }
}

module.exports = {
  pickSupabaseUrl,
  pickAnonKey,
  pickServiceKey,
  bearerToken,
  createUserClient,
  createAdminClient,
  verifyUserJwt,
};
