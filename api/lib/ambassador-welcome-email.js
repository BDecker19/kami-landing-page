const AMBASSADOR_WELCOME_SUBJECT = "Welcome to the Kami Ambassador Program";
const AMBASSADOR_WELCOME_FROM = "Benji from Kami <ambassadors@mail.kamisocial.com>";
const AMBASSADOR_WELCOME_REPLY_TO = "benji@kamisocial.com";
const DASHBOARD_URL = "https://www.kamisocial.com/ambassador";
const WEBSITE_URL = "https://www.kamisocial.com";
const SUPPORT_EMAIL = "ambassadors@kamisocial.com";
const LOGO_URL = "https://admin.kamisocial.com/kami-logo.png";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveFirstName({ firstName, displayName } = {}) {
  const direct = String(firstName || "").trim();
  if (direct) return direct.split(/\s+/)[0];
  const display = String(displayName || "").trim();
  if (display) return display.split(/\s+/)[0];
  return "there";
}

function bulletList(items) {
  return items
    .map(
      (item) => `
        <tr>
          <td style="padding: 0 0 10px; vertical-align: top; width: 18px; color: #c084fc; font-size: 15px; line-height: 1.55;">•</td>
          <td style="padding: 0 0 10px; color: rgba(255, 255, 255, 0.78); font-size: 15px; line-height: 1.55;">${item}</td>
        </tr>`
    )
    .join("");
}

function renderAmbassadorWelcomeEmailText({ firstName } = {}) {
  const greeting = resolveFirstName({ firstName });
  return [
    `Hi ${greeting},`,
    "",
    "Thanks for joining the Kami Ambassador Program.",
    "",
    "We're building Kami to help people discover what's happening around them, spend more time in the real world, and build stronger local communities. As an ambassador, you're helping us grow that network one person at a time.",
    "",
    "Your Ambassador Dashboard is now active and includes your referral link, current program terms, referral activity, and earnings information.",
    "",
    `Ambassador Dashboard: ${DASHBOARD_URL}`,
    `Kami Website: ${WEBSITE_URL}`,
    "",
    "A few quick notes:",
    "",
    "• Share Kami with people you genuinely think will enjoy it.",
    "• Be honest about what Kami is and what it isn't.",
    "• Don't spam, mass-message, or use misleading promotions.",
    "• Check your Ambassador Dashboard periodically for current program terms, qualification requirements, rates, Tier Caps, and payout thresholds.",
    "",
    "We're still early, and that's part of what makes this exciting. Ambassador feedback will directly influence how the program evolves, what features we build, and how Kami grows over time.",
    "",
    `If you ever have questions, ideas, or run into issues, reach out anytime at ${SUPPORT_EMAIL}.`,
    "",
    "Thanks for helping us build something that gets people out into the world.",
    "",
    "— Benji Decker",
    "Founder, Kami",
  ].join("\n");
}

function renderAmbassadorWelcomeEmailHtml({ firstName } = {}) {
  const greeting = escapeHtml(resolveFirstName({ firstName }));
  const notes = bulletList([
    "Share Kami with people you genuinely think will enjoy it.",
    "Be honest about what Kami is and what it isn't.",
    "Don't spam, mass-message, or use misleading promotions.",
    "Check your Ambassador Dashboard periodically for current program terms, qualification requirements, rates, Tier Caps, and payout thresholds.",
  ]);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>${escapeHtml(AMBASSADOR_WELCOME_SUBJECT)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#07030f;color:#ffffff;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#07030f;padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#120824;border:1px solid rgba(168,85,247,0.28);border-radius:24px;overflow:hidden;">
            <tr>
              <td style="background-color:#a855f7;background-image:linear-gradient(90deg,#7c3aed 0%,#a855f7 55%,#c084fc 100%);font-size:0;line-height:0;height:4px;">&nbsp;</td>
            </tr>
            <tr>
              <td align="center" style="padding:32px 32px 16px">
                <img src="${escapeHtml(LOGO_URL)}" alt="Kami" width="72" height="72" style="display:block;border:0;height:auto;max-width:72px" />
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px">
                <p style="margin:0 0 8px;color:rgba(255,255,255,0.68);font-size:13px;font-weight:700;letter-spacing:0.08em;text-align:center;text-transform:uppercase;">Kami Ambassador Program</p>
                <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;line-height:1.25;text-align:center;">Welcome to the Kami Ambassador Program</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0">
                <p style="margin:0 0 16px;color:#ffffff;font-size:16px;line-height:1.6;">Hi ${greeting},</p>
                <p style="margin:0 0 16px;color:rgba(255,255,255,0.82);font-size:16px;line-height:1.65;">Thanks for joining the Kami Ambassador Program.</p>
                <p style="margin:0 0 16px;color:rgba(255,255,255,0.82);font-size:16px;line-height:1.65;">We're building Kami to help people discover what's happening around them, spend more time in the real world, and build stronger local communities. As an ambassador, you're helping us grow that network one person at a time.</p>
                <p style="margin:0;color:rgba(255,255,255,0.82);font-size:16px;line-height:1.65;">Your Ambassador Dashboard is now active and includes your referral link, current program terms, referral activity, and earnings information.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:28px 32px 8px">
                <a href="${escapeHtml(DASHBOARD_URL)}" style="background-color:#a855f7;border-radius:999px;color:#ffffff;display:inline-block;font-size:16px;font-weight:800;line-height:1;padding:16px 32px;text-decoration:none;">Open Ambassador Dashboard</a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 0">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.22);border-radius:16px;">
                  <tr>
                    <td style="padding:18px 20px 8px">
                      <p style="margin:0 0 12px;color:#d8c2ff;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">A few quick notes</p>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${notes}</table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0">
                <p style="margin:0 0 16px;color:rgba(255,255,255,0.82);font-size:16px;line-height:1.65;">We're still early, and that's part of what makes this exciting. Ambassador feedback will directly influence how the program evolves, what features we build, and how Kami grows over time.</p>
                <p style="margin:0 0 16px;color:rgba(255,255,255,0.82);font-size:16px;line-height:1.65;">If you ever have questions, ideas, or run into issues, reach out anytime at <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:#c084fc;font-weight:600;text-decoration:none;">${escapeHtml(SUPPORT_EMAIL)}</a>.</p>
                <p style="margin:0 0 4px;color:rgba(255,255,255,0.82);font-size:16px;line-height:1.65;">Thanks for helping us build something that gets people out into the world.</p>
                <p style="margin:16px 0 0;color:#ffffff;font-size:16px;line-height:1.6;">— Benji Decker<br /><span style="color:rgba(255,255,255,0.68);font-size:14px;">Founder, Kami</span></p>
                <p style="margin:14px 0 0"><a href="${escapeHtml(WEBSITE_URL)}" style="color:#c084fc;font-size:15px;font-weight:600;text-decoration:none;">${escapeHtml(WEBSITE_URL)}</a></p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid rgba(255,255,255,0.08);padding:20px 32px 24px;">
                <p style="margin:0;color:rgba(255,255,255,0.48);font-size:13px;line-height:1.55;text-align:center;">Kami Ambassador Program · <a href="${escapeHtml(WEBSITE_URL)}" style="color:#d8c2ff;text-decoration:none;">www.kamisocial.com</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

module.exports = {
  AMBASSADOR_WELCOME_SUBJECT,
  AMBASSADOR_WELCOME_FROM,
  AMBASSADOR_WELCOME_REPLY_TO,
  renderAmbassadorWelcomeEmailHtml,
  renderAmbassadorWelcomeEmailText,
  resolveFirstName,
};
