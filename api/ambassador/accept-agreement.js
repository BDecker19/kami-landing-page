const { parseJsonBody, getClientIp, sendJson } = require("../lib/request");
const { bearerToken, createUserClient, createAdminClient, pickAnonKey, pickServiceKey } = require("../lib/supabase-auth");
const { maybeSendAmbassadorWelcomeEmail } = require("../lib/ambassador-welcome-send");

module.exports = async function ambassadorAcceptAgreement(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  if (!pickAnonKey()) {
    sendJson(res, 503, { ok: false, error: "not_configured" });
    return;
  }

  const userJwt = bearerToken(req);
  if (!userJwt) {
    sendJson(res, 401, { ok: false, error: "not_authenticated" });
    return;
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (_e) {
    sendJson(res, 400, { ok: false, error: "invalid_body" });
    return;
  }

  const agreementVersion =
    typeof body.agreement_version === "string" ? body.agreement_version.trim() : "";
  const agreementSnapshot =
    typeof body.agreement_snapshot === "string" ? body.agreement_snapshot : "";
  const programParametersSnapshot =
    body.program_parameters_snapshot && typeof body.program_parameters_snapshot === "object"
      ? body.program_parameters_snapshot
      : null;

  if (!agreementVersion || !agreementSnapshot) {
    sendJson(res, 400, { ok: false, error: "missing_fields" });
    return;
  }

  let supabase;
  try {
    supabase = createUserClient(userJwt);
  } catch (_e) {
    sendJson(res, 503, { ok: false, error: "not_configured" });
    return;
  }

  const { data, error } = await supabase.rpc("accept_my_ambassador_agreement", {
    p_agreement_version: agreementVersion,
    p_agreement_snapshot: agreementSnapshot,
    p_program_parameters_snapshot: programParametersSnapshot,
    p_ip_address: getClientIp(req),
    p_user_agent: String(req.headers["user-agent"] || "").slice(0, 500),
  });

  if (error) {
    sendJson(res, 500, { ok: false, error: "rpc_error", message: error.message });
    return;
  }

  if (!data?.ok) {
    sendJson(res, 400, data || { ok: false, error: "accept_failed" });
    return;
  }

  let welcomeEmail = { sent: false, status: "skipped" };
  if (
    data.first_agreement_acceptance &&
    !data.welcome_email_sent &&
    data.ambassador_user_id &&
    pickServiceKey()
  ) {
    try {
      const admin = createAdminClient();
      welcomeEmail = await maybeSendAmbassadorWelcomeEmail(admin, {
        userId: data.ambassador_user_id,
        acceptanceId: data.acceptance_id,
        firstAgreementAcceptance: true,
        welcomeEmailAlreadySent: false,
      });
    } catch (err) {
      console.warn("ambassador welcome email non-blocking failure", {
        user_id: data.ambassador_user_id,
        error: err instanceof Error ? err.message : String(err),
      });
      welcomeEmail = {
        sent: false,
        status: "send_failed",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  sendJson(res, 200, { ...data, welcome_email: welcomeEmail });
};
