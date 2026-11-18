// Sends a parent their order confirmation from the shop's Gmail account.
// Needs Vercel environment variables GMAIL_USER and GMAIL_APP_PASSWORD (a Google app password).
// Optional: SHOP_NOTIFY_EMAIL gets a blind copy of every confirmation.
const nodemailer = require("nodemailer");

const SB_URL = "https://kltimlhrxrlallcxwdjd.supabase.co";
const SB_KEY = "sb_publishable_irRm75ZoaSUjwucHz28ryg_hPODdfL9";

const money = (n) => "$" + Number(n || 0).toFixed(2);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const longDate = (d) => (d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ sent: false, error: "method_not_allowed" });
  const { GMAIL_USER, GMAIL_APP_PASSWORD, SHOP_NOTIFY_EMAIL } = process.env;
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
  const site = "https://" + host;
  const lookupUrl = `${site}/order?code=${encodeURIComponent(o.code)}&email=${encodeURIComponent(o.email)}`;
  const first = String(o.parent || "").split(" ")[0] || "there";
  const pickupLine = o.fulfillment === "ship" ? `Shipping to: ${o.address}` : `Pickup: ${o.pickup_note || "at the shop"}`;
  const payLine =
    o.pay_mode === "coach" ? "Your coach is collecting payment for the team."
    : o.pay_link ? `Payment due: ${money(o.total)}. Pay here and use order number ${o.code}: ${o.pay_link}`
    : `Payment due: ${money(o.total)}. The shop will send you a payment link.`;
  const itemLine = (i) => `${i.qty} × ${i.name} (${i.size})${i.pname ? " · " + i.pname : ""}${i.pnum ? " #" + i.pnum : ""} — ${money(i.unit * i.qty)}`;

  const text = [
    `Hi ${first},`, "",
    `Thanks for your order! Order ${o.code} for ${o.player} is in at the ${o.store} team store.`, "",
    ...o.items.map(itemLine),
    Number(o.ship) ? `Shipping — ${money(o.ship)}` : null,
    `Total: ${money(o.total)}`, "",
    pickupLine, payLine, "",
    o.closes ? `We print everything after the store closes on ${longDate(o.closes)}.` : null,
    `Look up your order anytime: ${lookupUrl}`, "",
    "ColorSplash Uniforms & Embroidery", "2403 Santa Fe Drive, Pueblo, CO 81006", "719-564-9655",
  ].filter((l) => l !== null).join("\n");

  const rows = o.items.map((i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e3e6ea"><strong>${esc(i.name)}</strong> · ${esc(i.size)}${i.pname || i.pnum ? `<br><span style="color:#5d6672">${esc(i.pname)}${i.pnum ? " #" + esc(i.pnum) : ""}</span>` : ""}${i.qty > 1 ? `<br><span style="color:#5d6672">${i.qty} × ${money(i.unit)}</span>` : ""}</td><td style="padding:8px 0;border-bottom:1px solid #e3e6ea;text-align:right;white-space:nowrap">${money(i.unit * i.qty)}</td></tr>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f2;font-family:Arial,Helvetica,sans-serif;color:#15202e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f2;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden">
<tr><td style="height:6px;background:linear-gradient(90deg,#f37021,#f6c90f,#8dc63f,#36a9e1,#e6007e,#e30613);background-color:#36a9e1"></td></tr>
<tr><td style="padding:24px 24px 8px"><div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5d6672">ColorSplash Team Store · ${esc(o.store)}</div>
<h1 style="margin:6px 0 0;font-size:26px">Thanks, ${esc(first)}! Your order is in.</h1>
<p style="margin:8px 0 0;font-size:15px">Order <strong>${esc(o.code)}</strong> for <strong>${esc(o.player)}</strong></p></td></tr>
<tr><td style="padding:8px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${rows}
${Number(o.ship) ? `<tr><td style="padding:8px 0">Shipping</td><td style="padding:8px 0;text-align:right">${money(o.ship)}</td></tr>` : ""}
<tr><td style="padding:10px 0;font-size:17px"><strong>Total</strong></td><td style="padding:10px 0;text-align:right;font-size:17px"><strong>${money(o.total)}</strong></td></tr></table></td></tr>
<tr><td style="padding:8px 24px;font-size:14px;line-height:1.5"><p style="margin:0 0 8px">${esc(pickupLine)}</p>
<p style="margin:0 0 8px">${o.pay_mode === "coach" ? "Your coach is collecting payment for the team." : o.pay_link ? `Payment due: <strong>${money(o.total)}</strong>. <a href="${esc(o.pay_link)}" style="color:#c8102e">Pay now</a> and use order number ${esc(o.code)}.` : `Payment due: <strong>${money(o.total)}</strong>. The shop will send you a payment link.`}</p>
${o.closes ? `<p style="margin:0 0 8px">We print everything after the store closes on ${esc(longDate(o.closes))}.</p>` : ""}
<p style="margin:12px 0 0"><a href="${esc(lookupUrl)}" style="display:inline-block;background:#15202e;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:bold">Look up your order</a></p></td></tr>
<tr><td style="padding:20px 24px;font-size:12px;color:#5d6672;border-top:1px solid #e3e6ea">ColorSplash Uniforms &amp; Embroidery · 2403 Santa Fe Drive, Pueblo, CO 81006 · 719-564-9655</td></tr>
</table></td></tr></table></body></html>`;

  try {
    const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } });
    await t.sendMail({
      from: `"ColorSplash Team Store" <${GMAIL_USER}>`,
      to: o.email,
      bcc: SHOP_NOTIFY_EMAIL || undefined,
      replyTo: GMAIL_USER,
      subject: `Your ${o.store} order ${o.code}`,
      text,
      html,
    });
    return res.status(200).json({ sent: true });
  } catch (e) {
    console.error("send failed", e && e.message);
    return res.status(500).json({ sent: false, error: "send_failed" });
  }
};
