const crypto = require("crypto");

const SESSION_ID_PATTERN = /^[a-f0-9]{64}$/i;

function isValidSessionId(value) {
  return SESSION_ID_PATTERN.test(String(value || ""));
}

function hashSessionId(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

async function applySessionAction({ db, uid, sessionId, action, FieldValue }) {
  const sessionHash = hashSessionId(sessionId);
  const sessionRef = db.collection("activeUserSessions").doc(uid);

  return db.runTransaction(async transaction => {
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

    if (action === "release") {
      if (matches) {
        transaction.delete(sessionRef);
        return { active: false, released: true };
      }
      return { active: false, released: false };
    }

    throw new Error("Unsupported device session action");
  });
}

module.exports = { isValidSessionId, hashSessionId, applySessionAction };
