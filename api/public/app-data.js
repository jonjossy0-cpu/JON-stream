"use strict";

const { getServices } = require("../_lib/firebaseAdmin");
const { selectPublicAppData } = require("../_lib/publicAppData");

module.exports = async function handler(req, res) {
  // This endpoint serves only the app's public configuration. It never accepts
  // credentials and deliberately uses wildcard CORS so the shared CDN cache
  // does not vary by the requesting website's Origin.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(204).end();
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    res.setHeader("Cache-Control", "no-store");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { db } = getServices();
    const snapshot = await db.collection("jonStream").doc("appData").get();

    if (!snapshot.exists) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(404).json({ error: "Public app data is not configured" });
    }

    const data = selectPublicAppData(snapshot.data());

    // Public app settings (including the Admin-controlled News Ticker speed)
    // must reflect the latest Firestore value instead of a stale shared CDN copy.
    // The client already keeps a short in-memory cache to avoid repeated reads.
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.status(200).json({ data });
  } catch (error) {
    console.error("Public app data API failed:", error && error.message);
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).json({ error: "App data is temporarily unavailable" });
  }
};
