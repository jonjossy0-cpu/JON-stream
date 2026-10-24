const crypto = require("crypto");

function decodeTicket(ticket, secret) {
  if (typeof ticket !== "string" || ticket.length > 4096 || !secret || secret.length < 32) return null;
  const parts = ticket.split(".");
  if (parts.length !== 2) return null;
  const [encoded, supplied] = parts;
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest();
  let actual;
  try { actual = Buffer.from(supplied, "base64url"); } catch (_) { return null; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload.v !== 1 || !payload.channelId || !payload.host || !Number.isInteger(payload.exp)) return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function isWithinChannelRoot(target, sourceUrl) {
  try {
    const source = new URL(sourceUrl);
    if (target.origin !== source.origin) return false;
    const slash = source.pathname.lastIndexOf("/");
    const root = source.pathname.slice(0, slash + 1) || "/";
    return target.pathname.startsWith(root);
  } catch (_) {
    return false;
  }
}

module.exports = { decodeTicket, isWithinChannelRoot };
