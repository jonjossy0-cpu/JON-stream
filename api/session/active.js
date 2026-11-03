const crypto = require("crypto");
const { getServices, requireUser, sendError, setCors } = require("../_lib/firebaseAdmin");

const SESSION_ID_PATTERN = /^[a-f0-9]{64}$/i;
const hashSessionId = value => crypto.createHash("sha256").update(String(value)).digest("hex");

module.exports = async function handler(req, res) {
  if (setCors(req, res)) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await requireUser(req);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = String(body.action || "").trim().toLowerCase();
    const sessionId = String(body.sessionId || "").trim();
    if (!["claim", "check", "release"].includes(action)) {
      return res.status(400).json({ error: "A valid session action is required" });
    }
    if (!SESSION_ID_PATTERN.test(sessionId)) {
      return res.status(400).json({ error: "A valid device session ID is required" });
    }

    const { db, FieldValue } = getServices();
    const sessionHash = hashSessionId(sessionId);
    const sessionRef = db.collection("activeUserSessions").doc(user.uid);
    const result = await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(sessionRef);
      const current = snapshot.exists ? snapshot.data() || {} : {};
      const matches = snapshot.exists && current.sessionIdHash === sessionHash;

      if (action === "claim") {
        transaction.set(sessionRef, {
          sessionIdHash: sessionHash,
          claimedAt: FieldValue.serverTimestamp(),
          lastSeenAt: FieldValue.serverTimestamp()
        });
        return { active: true, replaced: snapshot.exists && !matches };
      }

      if (action === "check") {
        if (!matches) return { active: false };
        transaction.update(sessionRef, { lastSeenAt: FieldValue.serverTimestamp() });
        return { active: true };
      }

      if (matches) {
        transaction.delete(sessionRef);
        return { active: false, released: true };
      }
      return { active: false, released: false };
    });

    if (action === "check" && !result.active) {
      return res.status(409).json({ ...result, error: "This account is active on another device", errorCode: "SESSION_REPLACED" });
    }
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};
