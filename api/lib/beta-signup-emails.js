const { sendBetaConfirmationEmail } = require("./beta-confirmation-email");
const { sendBetaInternalNotification } = require("./beta-internal-notification");

async function sendBetaSignupEmails({ email, platform, source, storage, groupAdd }) {
  const logPrefix = `[${platform}-beta]`;
  const requestedAt = new Date().toISOString();

  const confirmationEmail = await sendBetaConfirmationEmail({ email, platform, source });
  if (!confirmationEmail.ok) {
    console.error(`${logPrefix} confirmation email failed`, {
      error: confirmationEmail.error,
      message: confirmationEmail.message,
    });
  }

  const internalNotification = await sendBetaInternalNotification({
    email,
    platform,
    source,
    requestedAt,
    storage,
    groupAdd,
    confirmationEmail,
  });
  if (!internalNotification.ok) {
    console.error(`${logPrefix} internal notification failed`, {
      error: internalNotification.error,
      message: internalNotification.message,
    });
  }

  return { confirmationEmail, internalNotification };
}

module.exports = { sendBetaSignupEmails };
