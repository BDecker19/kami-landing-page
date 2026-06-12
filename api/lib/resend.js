async function sendResendEmail({ from, to, subject, html, text, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "missing_resend_api_key" };
  }

  const payload = { from, to, subject, html, text };
  if (replyTo) payload.reply_to = replyTo;

  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return {
      ok: false,
      error: "resend_request_failed",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  let body = null;
  try {
    body = await response.json();
  } catch (_e) {
    body = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      error: "resend_send_failed",
      message: body?.message || `Resend HTTP ${response.status}`,
      status: response.status,
    };
  }

  return { ok: true, id: body?.id || null };
}

module.exports = { sendResendEmail };
