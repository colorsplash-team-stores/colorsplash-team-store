// Sends a parent their order confirmation from the shop's Gmail account.
// Needs Vercel environment variables GMAIL_USER and GMAIL_APP_PASSWORD (a Google app password).
// Optional: SHOP_NOTIFY_EMAIL gets a blind copy of every confirmation.
const nodemailer = require("nodemailer");
const { build } = require("../lib/confirmation-email");

const SB_URL = "https://kltimlhrxrlallcxwdjd.supabase.co";
const SB_KEY = "sb_publishable_irRm75ZoaSUjwucHz28ryg_hPODdfL9";


module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ sent: false, error: "method_not_allowed" });
  const GMAIL_USER = (process.env.GMAIL_USER || "").trim();
  const GMAIL_APP_PASSWORD = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "");
  const SHOP_NOTIFY_EMAIL = (process.env.SHOP_NOTIFY_EMAIL || "").trim();
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return res.status(503).json({ sent: false, error: "email_not_configured" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const code = String(body?.code || "").trim().slice(0, 12);
  const email = String(body?.email || "").trim().slice(0, 200);
  if (!code || !email) return res.status(400).json({ sent: false, error: "missing_fields" });

  // Claims the order's one confirmation email. Returns null if already sent or no match.
  const r = await fetch(SB_URL + "/rest/v1/rpc/claim_confirmation", {
    method: "POST",
    headers: { apikey: SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ p_code: code, p_email: email }),
  });
  if (!r.ok) return res.status(502).json({ sent: false, error: "lookup_failed" });
  const o = await r.json();
  if (!o) return res.status(200).json({ sent: false, reason: "already_sent_or_not_found" });

  const host = req.headers["x-forwarded-host"] || req.headers.host || "colorsplash-team-store.vercel.app";
  const { subject, html, text } = build(o, "https://" + host);

  try {
    const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } });
    await t.sendMail({
      from: `"ColorSplash Team Store" <${GMAIL_USER}>`,
      to: o.email,
      bcc: SHOP_NOTIFY_EMAIL || undefined,
      replyTo: GMAIL_USER,
      subject,
      text,
      html,
    });
    console.log("confirmation sent", o.code);
    return res.status(200).json({ sent: true });
  } catch (e) {
    // Error codes like EAUTH carry no secrets; record them so the cause is visible.
    const why = [e && e.code, e && e.responseCode, e && String(e.response || e.message || "").slice(0, 200)].filter(Boolean).join(" | ");
    console.error("confirmation send failed", o.code, why);
    try {
      await fetch(SB_URL + "/rest/v1/rpc/release_confirmation", {
        method: "POST",
        headers: { apikey: SB_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_code: o.code, p_email: o.email, p_error: why }),
      });
    } catch {}
    return res.status(500).json({ sent: false, error: "send_failed", code: (e && e.code) || null });
  }
};
