#!/usr/bin/env node
/**
 * Send a one-off ambassador welcome email preview to a test inbox.
 * Usage: RESEND_API_KEY=... node scripts/send-ambassador-welcome-test.js [email] [firstName]
 */
const fs = require("fs");
const path = require("path");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, "..", ".env.local"));
loadEnvFile(path.join(__dirname, "..", ".env"));
loadEnvFile(path.join(__dirname, "..", ".env.vercel.pull"));

const { sendAmbassadorWelcomeTestEmail } = require("../api/lib/ambassador-welcome-send");

async function main() {
  const to = process.argv[2] || "benji@kamisocial.com";
  const firstName = process.argv[3] || "Benji";

  if (!process.env.RESEND_API_KEY) {
    console.error("Missing RESEND_API_KEY. Set it in .env.local or the environment.");
    process.exit(1);
  }

  const result = await sendAmbassadorWelcomeTestEmail(to, { firstName });
  if (!result.ok) {
    console.error("Send failed:", result.message || result.error);
    process.exit(1);
  }

  console.log(`Ambassador welcome test email sent to ${to} (Resend id: ${result.id || "unknown"})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
