/**
 * Public Points Store reward request intake for kamisocial.com/store.
 * Calls kami_request_point_store_redemption via service role (server-side only).
 */
const { createClient } = require("@supabase/supabase-js");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function pickSupabaseUrl() {
  const u =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://bscnpilzmilzabagnypx.supabase.co";
  return String(u).trim().replace(/\/$/, "");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => {
      d += c;
    });
    req.on("end", () => resolve(d));
    req.on("error", reject);
  });
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const raw =
    typeof req.body === "string"
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : await readBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

function mapRpcToResponse(result) {
  const code = typeof result.code === "string" ? result.code : "unknown";

  if (result.ok) {
    return {
      ok: true,
      code: "success",
      message:
        "Request received. We'll review your Kami points and follow up by email if the reward is available.",
      request_id: result.request_id || null,
    };
  }

  if (code === "duplicate_pending") {
    return {
      ok: false,
      code,
      message: "You already have a pending request for this reward. We'll follow up by email.",
    };
  }

  if (
    code === "reward_unavailable" ||
    code === "reward_not_found" ||
    code === "reward_sold_out" ||
    code === "invalid_reward"
  ) {
    return {
      ok: false,
      code,
      message: "This reward is not currently available.",
    };
  }

  if (code === "invalid_email") {
    return {
      ok: false,
      code,
      message:
        typeof result.message === "string" && result.message.trim()
          ? result.message.trim()
          : "Please enter a valid email address.",
    };
  }

  return {
    ok: false,
    code,
    message: "Something went wrong submitting your request. Please try again.",
  };
}

module.exports = async function requestStoreReward(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, code: "method_not_allowed", message: "Method not allowed." });
    return;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!serviceKey) {
    res.status(503).json({
      ok: false,
      code: "not_configured",
      message: "Something went wrong submitting your request. Please try again.",
    });
    return;
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (_e) {
    res.status(400).json({
      ok: false,
      code: "invalid_body",
      message: "Something went wrong submitting your request. Please try again.",
    });
    return;
  }

  const rewardId = typeof body.reward_id === "string" ? body.reward_id.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const kamiHandle =
    typeof body.kami_handle === "string" ? body.kami_handle.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!UUID_RE.test(rewardId)) {
    res.status(400).json({
      ok: false,
      code: "invalid_reward",
      message: "This reward is not currently available.",
    });
    return;
  }

  if (note.length > 500) {
    res.status(400).json({
      ok: false,
      code: "invalid_note",
      message: "Note must be 500 characters or less.",
    });
    return;
  }

  const supabaseUrl = pickSupabaseUrl();
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.rpc("kami_request_point_store_redemption", {
    p_reward_id: rewardId,
    p_email: email,
    p_kami_handle: kamiHandle || null,
    p_requester_note: note || null,
  });

  if (error) {
    res.status(500).json({
      ok: false,
      code: "rpc_error",
      message: "Something went wrong submitting your request. Please try again.",
    });
    return;
  }

  const mapped = mapRpcToResponse(data || {});
  res.status(mapped.ok ? 200 : 400).json(mapped);
};
