/**
 * Completes password reset for recovery sessions without requiring MFA (AAL2).
 * Uses the service role only after verifying the JWT is a valid user session
 * whose AMR includes `recovery` (same guarantee as Supabase recovery links).
 */
const { createClient } = require("@supabase/supabase-js");

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => {
      d += c;
    });
    req.on("end", () => resolve(d));
    req.on("error", reject);
  });
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const raw =
    typeof req.body === "string"
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : await readBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

function jwtPayloadUnverified(jwt) {
  try {
    const parts = String(jwt).split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (b64.length % 4)) % 4;
    const pad = "=".repeat(padLen);
    const json = Buffer.from(b64 + pad, "base64").toString("utf8");
    return JSON.parse(json);
  } catch (_e) {
    return null;
  }
}

function amrIndicatesRecovery(payload) {
  const amr = payload && payload.amr;
  if (!Array.isArray(amr)) return false;
  for (const entry of amr) {
    if (entry === "recovery") return true;
    if (entry && typeof entry === "object" && entry.method === "recovery") return true;
  }
  return false;
}

function pickSupabaseUrl() {
  const u =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://bscnpilzmilzabagnypx.supabase.co";
  return String(u).trim().replace(/\/$/, "");
}

module.exports = async function passwordResetComplete(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!serviceKey) {
    res.status(503).json({ error: "Password reset service is not configured." });
    return;
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (_e) {
    res.status(400).json({ error: "Invalid JSON body." });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const userJwt = m ? m[1].trim() : "";
  if (!userJwt) {
    res.status(401).json({ error: "Missing session." });
    return;
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters." });
    return;
  }

  const supabaseUrl = pickSupabaseUrl();
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: getErr } = await admin.auth.getUser(userJwt);
  if (getErr || !userData?.user?.id) {
    res.status(401).json({ error: "Invalid or expired session. Request a new reset link." });
    return;
  }

  const payload = jwtPayloadUnverified(userJwt);
  if (!amrIndicatesRecovery(payload)) {
    res.status(403).json({ error: "This action is only allowed from an email password reset link." });
    return;
  }

  const uid = userData.user.id;
  const { error: upErr } = await admin.auth.admin.updateUserById(uid, { password });
  if (upErr) {
    res.status(400).json({ error: upErr.message || "Could not update password." });
    return;
  }

  res.status(200).json({ ok: true });
};
