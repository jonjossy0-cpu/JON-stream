const crypto = require("crypto");

const DAY_MS = 86400000;
const TICKET_TTL_SECONDS = 10 * 60;
const ID_FIELDS = ["premiumChannelId", "playbackChannelId", "channelId", "id", "publicChannelId"];
const ID_ARRAY_FIELDS = ["publicChannelIds", "channelIds", "aliases"];
const SOURCE_FIELDS = ["sourceUrl", "playbackUrl", "streamUrl", "url", "link"];
const ALLOWED_HOSTS = new Set([
  "88.212.15.19",
  "154.58.202.18",
  "5.9.121.178",
  "23.237.104.106",
  "amg01753-narrativeuk-amg01753c2-lg-gb-1832.playouts.now.amagi.tv"
]);

function cleanId(value) {
  const id = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? id : "";
}

function collectIds(record) {
  if (!record || typeof record !== "object") return [];
  const values = [];
  for (const key of ID_FIELDS) values.push(record[key]);
  for (const key of ID_ARRAY_FIELDS) {
    if (Array.isArray(record[key])) values.push(...record[key]);
  }
  return [...new Set(values.map(cleanId).filter(Boolean))];
}

function findPublicPremiumChannel(publicData, requestedId) {
  const id = cleanId(requestedId);
  if (!id) return { error: "INVALID_CHANNEL_ID" };
  const matches = [];
  for (const group of ["tv", "radio"]) {
    const entries = Array.isArray(publicData && publicData[group]) ? publicData[group] : [];
    for (const item of entries) {
      if (item && String(item.accessTier || "").toLowerCase() === "premium" && collectIds(item).includes(id)) {
        matches.push({ group, item });
      }
    }
  }
  if (!matches.length) return { error: "PREMIUM_CHANNEL_NOT_IN_LIST" };
  if (matches.length > 1) return { error: "PREMIUM_CHANNEL_ID_AMBIGUOUS" };
  return matches[0];
}

function findPrivateCatalogChannel(docs, publicIds) {
  const ids = new Set((publicIds || []).map(cleanId).filter(Boolean));
  if (!ids.size) return { error: "PREMIUM_CHANNEL_ID_MISSING" };
  const matches = (docs || []).filter(doc => {
    const data = doc && typeof doc.data === "function" ? doc.data() || {} : (doc && doc.data) || {};
    const docId = cleanId(doc && (doc.id || doc.ref && doc.ref.id));
    return ids.has(docId) || collectIds(data).some(id => ids.has(id));
  });
  if (!matches.length) return { error: "PREMIUM_CATALOG_RECORD_MISSING" };
  if (matches.length > 1) return { error: "PREMIUM_CATALOG_ID_AMBIGUOUS" };
  const doc = matches[0];
  const data = doc && typeof doc.data === "function" ? doc.data() || {} : (doc && doc.data) || {};
  const id = cleanId(doc && (doc.id || doc.ref && doc.ref.id));
  if (!id) return { error: "PREMIUM_CATALOG_ID_INVALID" };
  if (data.active !== true || String(data.accessTier || "").toLowerCase() !== "premium") {
    return { error: "PREMIUM_CATALOG_RECORD_INACTIVE" };
  }
  return { id, data };
}

function validateSource(sourceUrl) {
  let source;
  try { source = new URL(sourceUrl); } catch (_) { return null; }
  if (!["http:", "https:"].includes(source.protocol) ||
      source.username || source.password || source.port ||
      !ALLOWED_HOSTS.has(source.hostname)) return null;
  return source;
}

function timestampMillis(value) {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

function entitlementIsActive(item, now) {
  if (!item || item.active !== true) return false;
  if (item.unlimited === true) return true;
  return timestampMillis(item.expiresAt) > now;
}

function resolveAccess({ uidEntitlement, emailEntitlement, profile, emailVerified, now = Date.now() }) {
  if (!emailVerified) return { allowed: false, status: "email_verification_required", reason: "EMAIL_NOT_VERIFIED" };
  const entitlements = [uidEntitlement, emailEntitlement].filter(item => entitlementIsActive(item, now));
  if (entitlements.length) {
    const unlimited = entitlements.some(item => item.unlimited === true);
    const expiries = entitlements.map(item => timestampMillis(item.expiresAt)).filter(Boolean);
    const expiry = unlimited ? null : Math.max(...expiries);
    return { allowed: true, status: "premium", plan: unlimited ? "unlimited" : "paid", expiresAt: expiry };
  }
  const trialEnd = timestampMillis(profile && profile.trialEndsAt);
  if (trialEnd > now) return { allowed: true, status: "trial", plan: "trial", expiresAt: trialEnd };
  return { allowed: false, status: "free", reason: "PREMIUM_ENTITLEMENT_REQUIRED" };
}

function emailKey(email) {
  return crypto.createHash("sha256").update(String(email || "").trim().toLowerCase()).digest("hex");
}

function signTicket(payload, secret) {
  if (!secret || secret.length < 32) throw new Error("PREMIUM_TICKET_SECRET_MISSING");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return encoded + "." + signature;
}

module.exports = {
  DAY_MS, TICKET_TTL_SECONDS, ID_FIELDS, SOURCE_FIELDS,
  cleanId, collectIds, findPublicPremiumChannel, findPrivateCatalogChannel,
  validateSource, timestampMillis, entitlementIsActive, resolveAccess, emailKey, signTicket
};
