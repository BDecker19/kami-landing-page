const { sendResendEmail } = require("./resend");

const BETA_INTERNAL_NOTIFICATION_TO = "hello@kamisocial.com";
const BETA_INTERNAL_NOTIFICATION_FROM = "Kami Beta Signups <benji@mail.kamisocial.com>";

function formatStorageResult(storage) {
  if (!storage) return "unavailable";

  if (storage.skipped) return "skipped (no service role key)";
  if (storage.stored && storage.duplicate) return "duplicate (already stored)";
  if (storage.stored && storage.inserted) return "inserted";
  if (storage.stored) return "stored";
  if (storage.errorCode || storage.errorMessage) {
    return `failed (${storage.errorCode || "error"}: ${storage.errorMessage || "unknown"})`;
  }

  return "failed";
}

function formatGroupAddResult(groupAdd) {
  if (!groupAdd) return "n/a";
  if (groupAdd.ok) {
    return groupAdd.alreadyMember ? "already_member" : "added";
  }
  return `failed (${groupAdd.error || "unknown"})`;
}

function formatEmailResult(emailResult) {
  if (!emailResult) return "not_attempted";
  if (emailResult.ok) return emailResult.id ? `sent (${emailResult.id})` : "sent";
  return `failed (${emailResult.error || "unknown"}${emailResult.message ? `: ${emailResult.message}` : ""})`;
}

function renderBetaInternalNotificationText({
  email,
  platform,
  source,
  requestedAt,
  storage,
  groupAdd,
  confirmationEmail,
}) {
  const subject =
    platform === "ios" ? "New iOS Beta Signup" : "New Android Beta Signup";

  return [
    subject,
    "",
    `Email: ${email}`,
    `Platform: ${platform}`,
    `Source: ${source}`,
    `Requested at: ${requestedAt}`,
    `Supabase storage: ${formatStorageResult(storage)}`,
    `Android group add: ${formatGroupAddResult(groupAdd)}`,
    `Confirmation email: ${formatEmailResult(confirmationEmail)}`,
  ].join("\n");
}

async function sendBetaInternalNotification({
  email,
  platform,
  source,
  requestedAt,
  storage,
  groupAdd,
  confirmationEmail,
}) {
  const subject =
    platform === "ios" ? "New iOS Beta Signup" : "New Android Beta Signup";
  const text = renderBetaInternalNotificationText({
    email,
    platform,
    source,
    requestedAt,
    storage,
    groupAdd,
    confirmationEmail,
  });

  const result = await sendResendEmail({
    from: BETA_INTERNAL_NOTIFICATION_FROM,
    to: BETA_INTERNAL_NOTIFICATION_TO,
    subject,
    html: `<pre style="font-family:monospace;font-size:14px;line-height:1.5;">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`,
    text,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.error || "send_failed",
      message: result.message || null,
    };
  }

  return { ok: true, id: result.id || null };
}

module.exports = {
  BETA_INTERNAL_NOTIFICATION_TO,
  sendBetaInternalNotification,
  formatStorageResult,
  formatGroupAddResult,
  formatEmailResult,
};
