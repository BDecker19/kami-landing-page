/**
 * Completes password reset for recovery sessions without requiring MFA (AAL2).
 * Uses the service role after verifying the JWT is a valid user session that
 * came from password recovery: either `amr` contains `recovery`, or (for GoTrue
 * implicit tokens that use `otp` in `amr`) a fresh `recovery_sent_at` plus JWT `iat`.
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

/** @returns {string[]} lowercased method names from `amr` */
function extractAmrMethods(payload) {
  if (!payload || payload.amr == null) return [];
  const amr = payload.amr;
  if (typeof amr === "string") return [String(amr).toLowerCase()];
  if (!Array.isArray(amr)) return [];
  const out = [];
  for (const entry of amr) {
    if (typeof entry === "string") out.push(entry.toLowerCase());
    else if (entry && typeof entry.method === "string") out.push(String(entry.method).toLowerCase());
  }
  return out;
}

function amrHasRecoveryMethod(payload) {
  const methods = extractAmrMethods(payload);
  return methods.some((m) => m === "recovery");
}

/**
 * GoTrue often issues implicit recovery sessions with `amr: [{ method: "otp", ... }]`
 * (same shape as some magic-link sessions), so we also require a fresh
 * `recovery_sent_at` and a JWT `iat` shortly after that timestamp.
 * Tight window limits overlap with unrelated magic-link logins.
 */
function implicitRecoveryFromEmailLink(user, payload) {
  const rst = user && user.recovery_sent_at;
  if (!rst) return false;
  const sentMs = Date.parse(rst);
  if (Number.isNaN(sentMs)) return false;
  const now = Date.now();
  const iatMs = typeof payload.iat === "number" ? payload.iat * 1000 : 0;
  if (!iatMs) return false;
  if (iatMs < sentMs - 120000) return false;
  if (now - sentMs > 24 * 60 * 60 * 1000) return false;
  if (iatMs - sentMs > 4 * 60 * 60 * 1000) return false;
  const methods = extractAmrMethods(payload);
  if (methods.includes("recovery")) return true;
  if (methods.length === 1 && (methods[0] === "otp" || methods[0] === "magiclink")) return true;
  return false;
}

function isPasswordRecoverySession(user, payload) {
  if (!payload) return false;
  if (amrHasRecoveryMethod(payload)) return true;
  return implicitRecoveryFromEmailLink(user, payload);
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

  let user = userData.user;
  if (!user.recovery_sent_at) {
    const { data: adminUser } = await admin.auth.admin.getUserById(user.id);
    if (adminUser?.user?.recovery_sent_at) user = adminUser.user;
  }

  const payload = jwtPayloadUnverified(userJwt);
  if (!isPasswordRecoverySession(user, payload)) {
    res.status(403).json({ error: "This action is only allowed from an email password reset link." });
    return;
  }

  const uid = user.id;
  const { error: upErr } = await admin.auth.admin.updateUserById(uid, { password });
  if (upErr) {
    res.status(400).json({ error: upErr.message || "Could not update password." });
    return;
  }

  res.status(200).json({ ok: true });
};
