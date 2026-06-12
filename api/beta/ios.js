/**
 * iOS beta signup: persist email (Supabase when configured), then send confirmation
 * and internal notification emails via Resend.
 */
const { parseJsonBody, getClientIp, sendJson } = require("../lib/request");
const { isRateLimited } = require("../lib/rate-limit");
const { storeBetaSignup } = require("../lib/beta-signup-store");
const { normalizeEmail, isValidEmail } = require("../lib/email");
const { sendBetaSignupEmails } = require("../lib/beta-signup-emails");

module.exports = async function iosBetaSignup(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { success: false, error: "Method not allowed." });
    return;
  }

  const clientIp = getClientIp(req);
  if (isRateLimited(`ios-beta:ip:${clientIp}`)) {
    sendJson(res, 429, {
      success: false,
      error: "Too many requests. Please try again later.",
    });
    return;
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (_err) {
    sendJson(res, 400, { success: false, error: "Invalid request body." });
    return;
  }

  const email = normalizeEmail(body.email);
  const source =
    typeof body.source === "string" && body.source.trim()
      ? body.source.trim().slice(0, 64)
      : "website";

  if (!isValidEmail(email)) {
    sendJson(res, 400, { success: false, error: "Enter a valid email address." });
    return;
  }

  if (isRateLimited(`ios-beta:email:${email}`)) {
    sendJson(res, 429, {
      success: false,
      error: "Too many requests. Please try again later.",
    });
    return;
  }

  const storage = await storeBetaSignup(email, "ios", source);
  if (storage.stored) {
    console.info("[ios-beta] signup captured", {
      duplicate: Boolean(storage.duplicate),
      inserted: Boolean(storage.inserted),
    });
  } else if (storage.skipped) {
    console.info("[ios-beta] supabase storage skipped (no service key)");
  } else {
    console.error("[ios-beta] supabase storage failed; continuing with emails", {
      errorCode: storage.errorCode,
      errorMessage: storage.errorMessage,
      errorDetails: storage.errorDetails,
    });
  }

  await sendBetaSignupEmails({
    email,
    platform: "ios",
    source,
    storage,
    groupAdd: null,
  });

  sendJson(res, 200, {
    success: true,
    message: "You're in. Check your email for the TestFlight link.",
  });
};
