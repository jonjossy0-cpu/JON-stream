"use strict";

const PUBLIC_APP_DATA_FIELDS = Object.freeze([
  "tv",
  "radio",
  "ads",
  "notifications",
  "settings",
  "backgrounds"
]);

function selectPublicAppData(source) {
  const input = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  const output = {};

  for (const field of PUBLIC_APP_DATA_FIELDS) {
    const value = input[field];
    if (field === "settings") {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        output.settings = value;
      }
      continue;
    }
    if (Array.isArray(value)) output[field] = value;
  }

  return output;
}

module.exports = { PUBLIC_APP_DATA_FIELDS, selectPublicAppData };
