const { getServices, requireUser, requireAdmin, sendError, setCors } = require("../_lib/firebaseAdmin");

const DEFAULT_MONTHLY_PRICE_ETB = 499;
const DEFAULT_YEARLY_PRICE_ETB = 6000;
const MAX_PRICE_ETB = 100000000;

function validPrice(value) {
  return value !== "" && value != null &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0 && Number(value) <= MAX_PRICE_ETB;
}

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  try {
    const { db, FieldValue } = getServices();
    const ref = db.collection("subscriptionConfig").doc("public");
    if (req.method === "GET") {
      const snap = await ref.get();
      const data = snap.exists ? snap.data() : {};
      // Keep the legacy priceETB field compatible as the monthly price.
      const legacyMonthly = validPrice(data.priceETB) ? Number(data.priceETB) : DEFAULT_MONTHLY_PRICE_ETB;
      const monthlyPriceETB = validPrice(data.monthlyPriceETB) ? Number(data.monthlyPriceETB) : legacyMonthly;
      const yearlyPriceETB = validPrice(data.yearlyPriceETB) ? Number(data.yearlyPriceETB) : DEFAULT_YEARLY_PRICE_ETB;
      return res.status(200).json({
        currency: "ETB",
        monthlyPriceETB,
        yearlyPriceETB,
        priceETB: monthlyPriceETB
      });
    }
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const user = await requireUser(req);
    requireAdmin(user);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const hasMonthly = Object.prototype.hasOwnProperty.call(body, "monthlyPriceETB");
    const hasYearly = Object.prototype.hasOwnProperty.call(body, "yearlyPriceETB");
    const hasLegacy = Object.prototype.hasOwnProperty.call(body, "priceETB");
    if (!hasMonthly && !hasYearly && !hasLegacy) {
      return res.status(400).json({ error: "Provide monthlyPriceETB and/or yearlyPriceETB" });
    }
    const monthlyValue = hasMonthly ? body.monthlyPriceETB : body.priceETB;
    if ((hasMonthly || hasLegacy) && !validPrice(monthlyValue)) {
      return res.status(400).json({ error: "monthlyPriceETB must be a valid non-negative ETB amount" });
    }
    if (hasYearly && !validPrice(body.yearlyPriceETB)) {
      return res.status(400).json({ error: "yearlyPriceETB must be a valid non-negative ETB amount" });
    }
    const updates = {
      currency: "ETB",
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid
    };
    if (hasMonthly || hasLegacy) {
      updates.monthlyPriceETB = Number(monthlyValue);
      updates.priceETB = Number(monthlyValue);
    }
    if (hasYearly) updates.yearlyPriceETB = Number(body.yearlyPriceETB);
    await ref.set(updates, { merge: true });
    const snap = await ref.get();
    const saved = snap.data() || {};
    return res.status(200).json({
      ok: true,
      currency: "ETB",
      monthlyPriceETB: validPrice(saved.monthlyPriceETB) ? Number(saved.monthlyPriceETB) : DEFAULT_MONTHLY_PRICE_ETB,
      yearlyPriceETB: validPrice(saved.yearlyPriceETB) ? Number(saved.yearlyPriceETB) : DEFAULT_YEARLY_PRICE_ETB,
      priceETB: validPrice(saved.monthlyPriceETB) ? Number(saved.monthlyPriceETB) : DEFAULT_MONTHLY_PRICE_ETB
    });
  } catch (error) {
    return sendError(res, error);
  }
};
