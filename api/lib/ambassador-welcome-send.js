const { sendResendEmail } = require("./resend");
const { logEmailDelivery } = require("./email-delivery-log");
const {
  AMBASSADOR_WELCOME_FROM,
  AMBASSADOR_WELCOME_REPLY_TO,
  AMBASSADOR_WELCOME_SUBJECT,
  renderAmbassadorWelcomeEmailHtml,
  renderAmbassadorWelcomeEmailText,
  resolveFirstName,
} = require("./ambassador-welcome-email");

const EMAIL_TYPE = "ambassador_welcome";
const TEMPLATE_KEY = "ambassador-welcome";
const CATEGORY_SLUG = "ambassador";

function welcomeEmailSendEnabled() {
  return process.env.AMBASSADOR_WELCOME_EMAIL_SEND_ENABLED !== "false";
}

async function loadAmbassadorRecipient(admin, userId) {
  const { data: user, error: userError } = await admin
    .from("users")
    .select("id, auth_email")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !user?.auth_email) {
    return { ok: false, error: "missing_recipient_email" };
  }

  const { data: profile } = await admin
    .from("user_profiles")
    .select("display_name")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    ok: true,
    email: String(user.auth_email).trim(),
    firstName: resolveFirstName({
      displayName: profile?.display_name,
    }),
  };
}

function ambassadorWelcomeLogBase({ userId, acceptanceId, recipientEmail }) {
  return {
    email_type: EMAIL_TYPE,
    template_key: TEMPLATE_KEY,
    category_slug: CATEGORY_SLUG,
    recipient_email: recipientEmail,
    recipient_user_id: userId,
    subject: AMBASSADOR_WELCOME_SUBJECT,
    from_address: AMBASSADOR_WELCOME_FROM,
    reply_to: AMBASSADOR_WELCOME_REPLY_TO,
    is_test: false,
    metadata: {
      acceptance_id: acceptanceId || null,
      source: "ambassador_agreement_acceptance",
    },
  };
}

async function maybeSendAmbassadorWelcomeEmail(admin, {
  userId,
  acceptanceId,
  firstAgreementAcceptance,
  welcomeEmailAlreadySent,
}) {
  if (!welcomeEmailSendEnabled()) {
    return { sent: false, status: "disabled" };
  }

  if (!firstAgreementAcceptance || welcomeEmailAlreadySent) {
    return { sent: false, status: "skipped" };
  }

  const { data: profile, error: profileError } = await admin
    .from("ambassador_profiles")
    .select("welcome_email_sent_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    return { sent: false, status: "profile_lookup_failed", message: profileError.message };
  }

  if (profile?.welcome_email_sent_at) {
    return { sent: false, status: "already_sent" };
  }

  const recipient = await loadAmbassadorRecipient(admin, userId);
  if (!recipient.ok) {
    await logEmailDelivery({
      ...ambassadorWelcomeLogBase({
        userId,
        acceptanceId,
        recipientEmail: "unknown",
      }),
      status: "skipped",
      failure_reason: recipient.error,
    });
    return { sent: false, status: recipient.error };
  }

  const html = renderAmbassadorWelcomeEmailHtml({ firstName: recipient.firstName });
  const text = renderAmbassadorWelcomeEmailText({ firstName: recipient.firstName });

  const sendResult = await sendResendEmail({
    from: AMBASSADOR_WELCOME_FROM,
    to: recipient.email,
    subject: AMBASSADOR_WELCOME_SUBJECT,
    html,
    text,
    replyTo: AMBASSADOR_WELCOME_REPLY_TO,
  });

  const now = new Date().toISOString();

  if (!sendResult.ok) {
    await logEmailDelivery({
      ...ambassadorWelcomeLogBase({
        userId,
        acceptanceId,
        recipientEmail: recipient.email,
      }),
      status: "failed",
      failure_reason: sendResult.message || sendResult.error,
      sent_at: now,
    });
    console.warn("ambassador welcome email failed", {
      user_id: userId,
      error: sendResult.message || sendResult.error,
    });
    return { sent: false, status: "send_failed", message: sendResult.message || sendResult.error };
  }

  const { error: markError } = await admin
    .from("ambassador_profiles")
    .update({ welcome_email_sent_at: now, updated_at: now })
    .eq("user_id", userId)
    .is("welcome_email_sent_at", null);

  if (markError) {
    console.error("welcome_email_sent_at update failed", {
      user_id: userId,
      error: markError.message,
    });
  }

  await logEmailDelivery({
    ...ambassadorWelcomeLogBase({
      userId,
      acceptanceId,
      recipientEmail: recipient.email,
    }),
    status: "sent",
    provider_message_id: sendResult.id,
    sent_at: now,
  });

  console.info("ambassador welcome email sent", {
    user_id: userId,
    resend_id: sendResult.id,
    to: recipient.email,
  });

  return { sent: true, status: "sent", resendId: sendResult.id };
}

async function sendAmbassadorWelcomeTestEmail(to, { firstName = "Benji" } = {}) {
  const html = renderAmbassadorWelcomeEmailHtml({ firstName });
  const text = renderAmbassadorWelcomeEmailText({ firstName });
  const sendResult = await sendResendEmail({
    from: AMBASSADOR_WELCOME_FROM,
    to,
    subject: AMBASSADOR_WELCOME_SUBJECT,
    html,
    text,
    replyTo: AMBASSADOR_WELCOME_REPLY_TO,
  });

  const now = new Date().toISOString();
  const logBase = {
    email_type: EMAIL_TYPE,
    template_key: TEMPLATE_KEY,
    category_slug: CATEGORY_SLUG,
    recipient_email: to,
    subject: AMBASSADOR_WELCOME_SUBJECT,
    from_address: AMBASSADOR_WELCOME_FROM,
    reply_to: AMBASSADOR_WELCOME_REPLY_TO,
    is_test: true,
    metadata: { source: "send_ambassador_welcome_test_script", first_name: firstName },
  };

  if (!sendResult.ok) {
    await logEmailDelivery({
      ...logBase,
      status: "failed",
      failure_reason: sendResult.message || sendResult.error,
      sent_at: now,
    });
  } else {
    await logEmailDelivery({
      ...logBase,
      status: "sent",
      provider_message_id: sendResult.id,
      sent_at: now,
    });
  }

  return sendResult;
}

module.exports = {
  maybeSendAmbassadorWelcomeEmail,
  sendAmbassadorWelcomeTestEmail,
  welcomeEmailSendEnabled,
};
