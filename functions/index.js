const express = require("express");
const { onRequest } = require("firebase-functions/v2/https");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

// Reuse the existing authenticated handlers so entitlement and admin checks
// remain consistent with the current API implementation.
app.all("/config", require("../api/subscription/config"));
app.all("/grants", require("../api/subscription/grants"));
app.all("/grant", require("../api/subscription/grant"));
app.all("/status", require("../api/subscription/status"));
app.all("/fullscreen-preferences", require("../api/subscription/fullscreen-preferences"));

exports.subscriptionApi = onRequest(
  { region: "us-central1", cors: false, maxInstances: 10 },
  app
);
