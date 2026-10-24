const express = require("express");
const { onRequest } = require("firebase-functions/v2/https");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

// Bundled copies of the current handlers keep the deployed function self-contained.
app.all("/config", require("./subscription/config"));
app.all("/grants", require("./subscription/grants"));
app.all("/grant", require("./subscription/grant"));
app.all("/status", require("./subscription/status"));
app.all("/fullscreen-preferences", require("./subscription/fullscreen-preferences"));

exports.subscriptionApi = onRequest(
  { region: "us-central1", cors: false, maxInstances: 10 },
  app
);
