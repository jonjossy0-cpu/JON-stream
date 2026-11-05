"use strict";

// Explicit public allowlist for the existing jonStream/appData document.
// Never return premium entitlements, profiles, admin records, or billing data.
const PUBLIC_APP_DATA_FIELDS = Object.freeze([
  "tv",
  "radio",
  "ads",
  "notifications",
  "backgrounds",
  "settings",
  "prompt"
]);

const PREMIUM_SOURCE_FIELDS = new Set([
  "url", "streamUrl", "source", "sourceUrl", "playbackUrl", "backupUrl",
  "backupUrls", "backupStreams", "streamUrls", "sources", "gatewayUrl",
  "gatewayURL", "proxyUrl", "proxyURL", "hlsGateway", "hlsUrl",
  "playlistUrl", "manifestUrl", "fallbackUrl"
]);

function removePremiumSources(value) {
  if (Array.isArray(value)) return value.map(removePremiumSources);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (PREMIUM_SOURCE_FIELDS.has(key)) continue;
    output[key] = removePremiumSources(child);
  }
  return output;
}

function sanitizeChannelList(value) {
  return value.map(channel => {
    if (!channel || typeof channel !== "object" ||
        String(channel.accessTier || "free").toLowerCase() !== "premium") return channel;
    return removePremiumSources(channel);
  });
}

function selectPublicAppData(source) {
  const input = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  const output = {};

  for (const field of PUBLIC_APP_DATA_FIELDS) {
    const value = input[field];
    if (field === "settings") {
      if (value && typeof value === "object" && !Array.isArray(value)) output.settings = value;
      continue;
    }
    if (field === "prompt") {
      if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") output.prompt = value;
      continue;
    }
    if (Array.isArray(value)) output[field] = (field === "tv" || field === "radio") ? sanitizeChannelList(value) : value;
  }

  return output;
}

module.exports = { PUBLIC_APP_DATA_FIELDS, selectPublicAppData };
