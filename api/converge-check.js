// TEMPORARY: confirms the Converge settings work by requesting a payment session token
// (no card is charged). Reports only which environment accepted them, never the values.
const ENDPOINTS = {
  live: "https://api.convergepay.com/hosted-payments/transaction_token",
  demo: "https://api.demo.convergepay.com/hosted-payments/transaction_token",
};

async function tryEnv(url, id, user, pin) {
  const body = new URLSearchParams({
    ssl_merchant_id: id, ssl_user_id: user, ssl_pin: pin,
    ssl_transaction_type: "ccsale", ssl_amount: "1.00",
  });
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    const t = (await r.text()).trim();
    const ok = r.ok && /^[A-Za-z0-9+/=_%-]{20,}$/.test(t);
    // Return a short, value-free hint about failures (Converge error text never includes the PIN).
    return { ok, status: r.status, hint: ok ? "token received" : t.replace(/\s+/g, " ").slice(0, 160) };
  } catch (e) {
    return { ok: false, status: 0, hint: "network error: " + (e && e.message) };
  }
}

module.exports = async (req, res) => {
  const id = (process.env.CONVERGE_ACCOUNT_ID || "").trim();
  const user = (process.env.CONVERGE_USER_ID || "").trim();
  const pin = (process.env.CONVERGE_PIN || "").trim();
  const present = { account_id: !!id, user_id: !!user, pin: !!pin, pin_length: pin.length, user_starts_apiuser: /^apiuser/i.test(user) };
  if (!id || !user || !pin) return res.status(200).json({ present, error: "missing settings" });
  const [live, demo] = await Promise.all([tryEnv(ENDPOINTS.live, id, user, pin), tryEnv(ENDPOINTS.demo, id, user, pin)]);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ present, live, demo, mode: live.ok ? "live" : demo.ok ? "demo" : "neither" });
};
