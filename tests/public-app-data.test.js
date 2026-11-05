const test = require("node:test");
const assert = require("node:assert/strict");
const { PUBLIC_APP_DATA_FIELDS, selectPublicAppData } = require("../api/_lib/publicAppData");

test("public app data includes the app's approved public configuration only", () => {
  const source = {
    tv: [
      { id: "tv-1", name: "Channel", url: "https://example.com/live.m3u8" },
      { id: "tv-premium", name: "Premium Channel", accessTier: "premium", url: "https://private.example/live.m3u8", backupUrls: ["https://private.example/backup.m3u8"], logo: "https://example.com/logo.png" }
    ],
    radio: [
      { id: "radio-1", name: "Radio", url: "https://example.com/live.mp3" },
      { id: "radio-premium", name: "Premium Radio", accessTier: "premium", streamUrl: "https://private.example/radio.mp3" }
    ],
    ads: [{ id: "ad-1", title: "Announcement" }],
    notifications: [{ id: "notice-1", message: "Hello" }],
    backgrounds: [{ id: "bg-1", url: "https://example.com/bg.jpg" }],
    settings: { version: "1.0.0", maintenance: false },
    prompt: "Public notice",
    admins: ["private-admin-record"],
    subscriptionProfiles: { uid: { email: "private@example.com" } },
    premiumEntitlements: { uid: { active: true } },
    privateApiKey: "must-not-be-returned"
  };

  const result = selectPublicAppData(source);

  assert.deepEqual(Object.keys(result).sort(), [...PUBLIC_APP_DATA_FIELDS].filter(key => key in source).sort());
  assert.equal(result.tv[0].url, source.tv[0].url);
  assert.equal(result.tv[1].id, "tv-premium");
  assert.equal(result.tv[1].logo, source.tv[1].logo);
  assert.equal("url" in result.tv[1], false);
  assert.equal("backupUrls" in result.tv[1], false);
  assert.equal("streamUrl" in result.radio[1], false);
  assert.equal(result.radio[0].url, source.radio[0].url);
  assert.equal(result.settings.version, "1.0.0");
  assert.equal(result.backgrounds[0].url, source.backgrounds[0].url);
  assert.equal(result.prompt, "Public notice");
  assert.equal("admins" in result, false);
  assert.equal("subscriptionProfiles" in result, false);
  assert.equal("premiumEntitlements" in result, false);
  assert.equal("privateApiKey" in result, false);
});

test("invalid public fields are omitted safely", () => {
  assert.deepEqual(selectPublicAppData({
    tv: {},
    radio: null,
    ads: "not-an-array",
    settings: [],
    backgrounds: [],
    prompt: { private: "object" }
  }), { backgrounds: [] });
});
