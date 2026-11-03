const { getServices, requireUser, sendError, setCors } = require("../_lib/firebaseAdmin");
const { isValidSessionId, applySessionAction } = require("../_lib/deviceSession");

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
    if (!isValidSessionId(sessionId)) {
      return res.status(400).json({ error: "A valid device session ID is required" });
    }

    const { db, FieldValue } = getServices();
    const result = await applySessionAction({
      db,
      uid: user.uid,
      sessionId,
      action,
      FieldValue,
      confirm: body.confirm === true
    });

    if (action === "check" && !result.active) {
      return res.status(409).json({
        ...result,
        error: "This account is active on another device",
        errorCode: "SESSION_REPLACED"
      });
    }
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};
