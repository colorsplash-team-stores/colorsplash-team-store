// Builds the team-branded order confirmation email (HTML + plain text).
// Email-safe: table layout, inline styles, web-safe fonts, no SVG.

const money = (n) => "$" + Number(n || 0).toFixed(2);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const longDate = (d) => (d ? new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" }) : "");
const shortDate = (d) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Denver" }) : "");

function lum(hex) {
  const n = parseInt(String(hex || "#000000").replace("#", ""), 16) || 0;
  return [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
}

const SHOP = {
  name: "ColorSplash Uniforms & Embroidery",
  address: "2403 Santa Fe Drive, Pueblo, CO 81006",
  phone: "719-564-9655",
  web: "https://www.colorsplashuniforms.com",
  maps: "https://maps.google.com/?q=2403+Santa+Fe+Drive+Pueblo+CO+81006",
};
const RAINBOW = ["#f37021", "#f6c90f", "#8dc63f", "#36a9e1", "#e6007e", "#e30613"];
const FONT = "Arial,Helvetica,sans-serif";
const DISPLAY = "'Arial Black','Arial Bold',Gadget,Arial,sans-serif";

function build(o, site) {
  const c1 = /^#[0-9a-f]{6}$/i.test(o.color || "") ? o.color : "#1d3557";
  const c2 = /^#[0-9a-f]{6}$/i.test(o.color2 || "") ? o.color2 : "#c8102e";
  const onC1 = lum(c1) > 0.45 ? "#15202e" : "#ffffff";
  const onC2 = lum(c2) > 0.45 ? "#15202e" : "#ffffff";
  const abs = (u) => (!u ? null : /^https?:\/\//.test(u) ? u : site + (u.startsWith("/") ? u : "/" + u));
  const logo = abs(o.logo_url);
  const brandLogo = site + "/brand/colorsplash-logo.jpg";
  const lookupUrl = `${site}/order?code=${encodeURIComponent(o.code)}&email=${encodeURIComponent(o.email)}`;
  const storeUrl = o.store_slug ? `${site}/s/${encodeURIComponent(o.store_slug)}` : site;
  const first = String(o.parent || "").trim().split(/\s+/)[0] || "there";
  const items = Array.isArray(o.items) ? o.items : [];
  const pieces = items.reduce((a, i) => a + (Number(i.qty) || 0), 0);
  const ship = o.fulfillment === "ship";
  const fund = Number(o.fundraiser) || 0;

  const subject = `You're all set! ${o.store} order #${o.code}`;
  const preheader = `${pieces} item${pieces === 1 ? "" : "s"} for ${o.player} · ${money(o.total)} · We print after the store closes${o.closes ? " on " + longDate(o.closes) : ""}.`;

  const rainbow = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${RAINBOW.map((c) => `<td height="6" style="height:6px;line-height:6px;font-size:0;background:${c}" bgcolor="${c}">&nbsp;</td>`).join("")}</tr></table>`;
  const stripe = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td height="5" style="height:5px;line-height:5px;font-size:0;background:${c2}" bgcolor="${c2}">&nbsp;</td></tr>
    <tr><td height="4" style="height:4px;line-height:4px;font-size:0;background:#ffffff" bgcolor="#ffffff">&nbsp;</td></tr>
    <tr><td height="5" style="height:5px;line-height:5px;font-size:0;background:${c2}" bgcolor="${c2}">&nbsp;</td></tr></table>`;

  const jersey = (i) => {
    if (!i.pname && !i.pnum) return "";
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px"><tr>
      <td align="center" style="border:2px solid ${c1};border-radius:8px;padding:6px 14px;background:#ffffff" bgcolor="#ffffff">
        ${i.pname ? `<div style="font-family:${DISPLAY};font-size:11px;letter-spacing:3px;color:${c1};text-transform:uppercase">${esc(i.pname)}</div>` : ""}
        ${i.pnum ? `<div style="font-family:${DISPLAY};font-size:30px;line-height:32px;color:${c2};font-weight:900">${esc(i.pnum)}</div>` : ""}
      </td></tr></table>`;
  };

  const rows = items.map((i) => `
    <tr><td style="padding:14px 0;border-bottom:1px solid #e6e8ec;vertical-align:top;font-family:${FONT}">
      <div style="font-size:16px;font-weight:bold;color:#15202e">${esc(i.name)}</div>
      <div style="font-size:13px;color:#5d6672;margin-top:2px">Size <strong style="color:#15202e">${esc(i.size)}</strong>${Number(i.qty) > 1 ? ` &nbsp;·&nbsp; ${i.qty} × ${money(i.unit)}` : ""}</div>
      ${jersey(i)}
    </td>
    <td align="right" style="padding:14px 0;border-bottom:1px solid #e6e8ec;vertical-align:top;font-family:${FONT};font-size:16px;font-weight:bold;color:#15202e;white-space:nowrap">${money(Number(i.unit) * Number(i.qty))}</td></tr>`).join("");

  const step = (n, title, sub, active) => `
    <tr><td width="40" valign="top" style="padding:0 0 14px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" width="28" height="28" style="width:28px;height:28px;border-radius:14px;background:${active ? c1 : "#e6e8ec"};color:${active ? onC1 : "#5d6672"};font-family:${DISPLAY};font-size:13px" bgcolor="${active ? c1 : "#e6e8ec"}">${n}</td></tr></table>
    </td><td valign="top" style="padding:3px 0 14px;font-family:${FONT}">
      <div style="font-size:15px;font-weight:bold;color:#15202e">${title}</div>
      <div style="font-size:13px;color:#5d6672;margin-top:2px">${sub}</div>
    </td></tr>`;

  const payBox = o.pay_mode === "coach"
    ? `<div style="font-size:15px;color:#15202e"><strong>Payment:</strong> your coach is collecting payment for the team. Nothing to pay here.</div>`
    : o.pay_link
      ? `<div style="font-size:15px;color:#15202e;margin-bottom:12px"><strong>Payment due: ${money(o.total)}</strong><br><span style="font-size:13px;color:#5d6672">Use order number ${esc(o.code)} when you pay.</span></div>
         <a href="${esc(o.pay_link)}" style="display:inline-block;background:${c2};color:${onC2};font-family:${DISPLAY};font-size:14px;letter-spacing:1px;text-decoration:none;padding:12px 22px;border-radius:6px">PAY ${money(o.total)}</a>`
      : `<div style="font-size:15px;color:#15202e"><strong>Payment due: ${money(o.total)}</strong><br><span style="font-size:13px;color:#5d6672">The shop will send you a secure payment link.</span></div>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef0f3" bgcolor="#eef0f3">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef0f3">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#eef0f3" style="background:#eef0f3"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden" bgcolor="#ffffff">

  <tr><td align="center" style="padding:18px 20px 14px;background:#ffffff" bgcolor="#ffffff">
    <a href="${SHOP.web}"><img src="${brandLogo}" width="190" alt="ColorSplash Uniforms &amp; Embroidery" style="display:block;width:190px;max-width:60%;height:auto;border:0"></a>
  </td></tr>
  <tr><td>${rainbow}</td></tr>

  <tr><td style="background:${c1};padding:26px 24px 22px" bgcolor="${c1}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      ${logo ? `<td width="96" valign="middle" style="padding-right:16px"><img src="${esc(logo)}" width="88" alt="" style="display:block;width:88px;height:auto;border:0;background:#ffffff;border-radius:10px;padding:6px"></td>` : ""}
      <td valign="middle" style="font-family:${FONT};color:${onC1}">
        <div style="font-family:${DISPLAY};font-size:12px;letter-spacing:3px;text-transform:uppercase;opacity:.85">${esc(o.store)}${o.season ? " · " + esc(o.season) : ""}</div>
        <div style="font-family:${DISPLAY};font-size:28px;line-height:32px;margin-top:6px">You're all set, ${esc(first)}!</div>
        <div style="font-size:15px;margin-top:8px;opacity:.95">Order <strong>#${esc(o.code)}</strong> for <strong>${esc(o.player)}</strong> is in.</div>
      </td></tr></table>
  </td></tr>
  <tr><td>${stripe}</td></tr>

  <tr><td style="padding:22px 24px 4px">
    <div style="font-family:${DISPLAY};font-size:13px;letter-spacing:2px;color:${c1};text-transform:uppercase">Your gear</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}
      ${Number(o.ship) ? `<tr><td style="padding:10px 0 0;font-family:${FONT};font-size:14px;color:#5d6672">Shipping</td><td align="right" style="padding:10px 0 0;font-family:${FONT};font-size:14px;color:#5d6672">${money(o.ship)}</td></tr>` : ""}
      <tr><td style="padding:14px 0 4px;font-family:${DISPLAY};font-size:18px;color:#15202e">TOTAL</td><td align="right" style="padding:14px 0 4px;font-family:${DISPLAY};font-size:22px;color:${c1}">${money(o.total)}</td></tr>
    </table>
    ${fund > 0 ? `<div style="margin-top:10px;padding:10px 14px;border-radius:8px;background:#f3f8ef;font-family:${FONT};font-size:14px;color:#2f7d4f" bgcolor="#f3f8ef">&#9733; <strong>${money(fund)}</strong> of your order goes to the ${esc(o.store)} team fund. Thank you!</div>` : ""}
  </td></tr>

  <tr><td style="padding:18px 24px 6px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${c2};border-radius:10px"><tr><td style="padding:16px 18px;font-family:${FONT}">${payBox}</td></tr></table>
  </td></tr>

  <tr><td style="padding:20px 24px 4px">
    <div style="font-family:${DISPLAY};font-size:13px;letter-spacing:2px;color:${c1};text-transform:uppercase;margin-bottom:12px">What happens next</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${step(1, "Order received", `${shortDate(o.created_at) || "Today"}: you're on the list.`, true)}
      ${step(2, "We print the team's gear", o.closes ? `After the store closes on ${longDate(o.closes)}, we print and embroider everything together.` : "We print and embroider everything together after the store closes.", false)}
      ${step(3, ship ? "Shipped to you" : "Ready for pickup", ship ? `We'll ship to: ${esc(o.address)}` : `${esc(o.pickup_note || "Pick up at the shop")}. <a href="${SHOP.maps}" style="color:${c1}">Map</a>`, false)}
    </table>
  </td></tr>

  <tr><td align="center" style="padding:10px 24px 26px">
    <a href="${esc(lookupUrl)}" style="display:inline-block;background:#15202e;color:#ffffff;font-family:${DISPLAY};font-size:14px;letter-spacing:1px;text-decoration:none;padding:13px 26px;border-radius:6px">CHECK MY ORDER</a>
    <div style="font-family:${FONT};font-size:13px;color:#5d6672;margin-top:12px">Need another size or a sibling's gear? <a href="${esc(storeUrl)}" style="color:${c1}">Back to the team store</a></div>
  </td></tr>

  <tr><td>${rainbow}</td></tr>
  <tr><td align="center" style="padding:18px 24px 22px;background:#15202e;font-family:${FONT};font-size:12px;line-height:18px;color:#c9ced6" bgcolor="#15202e">
    <strong style="color:#ffffff;letter-spacing:1px">COLORSPLASH UNIFORMS &amp; EMBROIDERY</strong><br>
    <a href="${SHOP.maps}" style="color:#c9ced6;text-decoration:none">${SHOP.address}</a> &nbsp;·&nbsp; <span style="color:#c9ced6">${SHOP.phone}</span><br>
    <a href="${SHOP.web}" style="color:#ffffff">colorsplashuniforms.com</a><br>
    <span style="color:#8e96a1">Questions? Just reply to this email.</span>
  </td></tr>

</table></td></tr></table></body></html>`;

  const text = [
    `You're all set, ${first}!`, "",
    `${o.store}${o.season ? " · " + o.season : ""}`,
    `Order #${o.code} for ${o.player} is in.`, "",
    "YOUR GEAR",
    ...items.map((i) => `- ${i.qty} × ${i.name} (${i.size})${i.pname ? " · " + i.pname : ""}${i.pnum ? " #" + i.pnum : ""}: ${money(Number(i.unit) * Number(i.qty))}`),
    Number(o.ship) ? `Shipping: ${money(o.ship)}` : null,
    `TOTAL: ${money(o.total)}`,
    fund > 0 ? `${money(fund)} of your order goes to the team fund.` : null, "",
    o.pay_mode === "coach" ? "Payment: your coach is collecting payment for the team." : o.pay_link ? `Payment due: ${money(o.total)}. Pay here (use order #${o.code}): ${o.pay_link}` : `Payment due: ${money(o.total)}. The shop will send you a secure payment link.`, "",
    "WHAT HAPPENS NEXT",
    `1. Order received.`,
    `2. We print the team's gear${o.closes ? " after the store closes on " + longDate(o.closes) : " after the store closes"}.`,
    `3. ${ship ? "Shipped to: " + o.address : "Ready for pickup: " + (o.pickup_note || "at the shop")}.`, "",
    `Check your order: ${lookupUrl}`, "",
    SHOP.name, SHOP.address, SHOP.phone, "colorsplashuniforms.com", "Questions? Just reply to this email.",
  ].filter((l) => l !== null).join("\n");

  return { subject, html, text };
}

module.exports = { build };
