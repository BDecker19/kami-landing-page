const { pickSupabaseUrl } = require("./supabase-auth");

/**
 * Best-effort POST to the main monorepo log-email-delivery edge function.
 * No-ops when ingest secret or Supabase URL is unset (local/preview).
 */
async function logEmailDelivery(payload) {
  const secret = process.env.EMAIL_DELIVERY_LOG_INGEST_SECRET;
  const supabaseUrl = pickSupabaseUrl();

  if (!secret || !supabaseUrl) {
    return;
  }

  const url = `${supabaseUrl}/functions/v1/log-email-delivery`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let body = null;
      try {
        body = await response.json();
      } catch (_e) {
        body = null;
      }
      console.error("email_delivery_log ingest failed", {
        status: response.status,
        error: body?.error || body?.message || response.statusText,
        email_type: payload.email_type,
        recipient_email: payload.recipient_email,
      });
    }
  } catch (err) {
    console.error("email_delivery_log ingest request failed", {
      error: err instanceof Error ? err.message : String(err),
      email_type: payload.email_type,
      recipient_email: payload.recipient_email,
    });
  }
}

module.exports = { logEmailDelivery };
