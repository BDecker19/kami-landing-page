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
 * Android beta uses Google Group enrollment, which rejects Gmail plus-addresses (+alias).
 * Returns a user-facing error string, or null when allowed.
 */
function getAndroidBetaEmailValidationError(value) {
  const email = normalizeEmail(value);
  const at = email.lastIndexOf("@");
  if (at <= 0) return null;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (
    (domain === "gmail.com" || domain === "googlemail.com") &&
    local.includes("+")
  ) {
    return "Gmail plus-addresses (+) aren't supported for Android beta. Use your main Gmail address.";
  }

  return null;
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  getAndroidBetaEmailValidationError,
};
