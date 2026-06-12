const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  if (!EMAIL_RE.test(value)) return false;
  if (value.length > 254) return false;
  return true;
}

/**
 * Google Group enrollment via Admin SDK rejects Gmail plus-addresses (+alias).
 * Map to the base Gmail account used for Play beta access; keep the submitted
 * address for Supabase storage and confirmation email delivery.
 */
function normalizeEmailForGoogleGroupEnrollment(value) {
  const email = normalizeEmail(value);
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;

  let local = email.slice(0, at);
  let domain = email.slice(at + 1);

  if (domain === "googlemail.com") {
    domain = "gmail.com";
  }

  if (domain === "gmail.com" && local.includes("+")) {
    local = local.split("+")[0];
  }

  return `${local}@${domain}`;
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  normalizeEmailForGoogleGroupEnrollment,
};
