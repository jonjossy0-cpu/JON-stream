const admin = require("firebase-admin");

function getAdminApp() {
  if (admin.apps.length) return admin.app();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(raw);
  } catch (_) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON");
  }
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return admin.app();
}

function getServices() {
  getAdminApp();
  return { auth: admin.auth(), db: admin.firestore(), FieldValue: admin.firestore.FieldValue, Timestamp: admin.firestore.Timestamp };
}

async function requireUser(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const error = new Error("Authentication required");
    error.status = 401;
    throw error;
  }
  const { auth } = getServices();
  try {
    return await auth.verifyIdToken(match[1], true);
  } catch (_) {
    const error = new Error("Invalid or expired authentication token");
    error.status = 401;
    throw error;
  }
}

function requireAdmin(decoded) {
  const allowed = String(process.env.JON_ADMIN_UIDS || "").split(",").map(x => x.trim()).filter(Boolean);
  if (!allowed.length || !allowed.includes(decoded.uid)) {
    const error = new Error("Admin access required");
    error.status = 403;
    throw error;
  }
}

function setCors(req, res) {
  const origin = String(req.headers.origin || "");
  const allowedOrigins = new Set([
    "https://jonjossy0-cpu.github.io",
    "https://jon-stream.vercel.app",
    "https://appassets.androidplatform.net"
  ]);
  // Permit only this project's Vercel preview hostnames, never arbitrary origins.
  const isProjectPreview = /^https:\/\/jon-stream-[a-z0-9-]+-jonjossy0-5772\.vercel\.app$/.test(origin);
  const isAllowed = allowedOrigins.has(origin) || isProjectPreview;
  if (isAllowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") {
    if (!isAllowed) {
      res.status(403).end();
      return true;
    }
    res.status(204).end();
    return true;
  }
  return false;
}

function sendError(res, error) {
  const status = Number(error && error.status) || 500;
  if (status === 500) console.error("Premium API error:", error && error.message);
  return res.status(status).json({ error: status === 500 ? "Subscription service is not configured or temporarily unavailable" : error.message });
}

module.exports = { getServices, requireUser, requireAdmin, sendError, setCors };