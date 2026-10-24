const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Load the exact helper source from the Cloudflare Worker without executing
// the Worker entry point or making network requests.
const source = fs.readFileSync(path.join(__dirname, "../gateway/worker.js"), "utf8");
const start = source.indexOf("function premiumPrefixes(env) {");
const end = source.indexOf("function decodeBase64Url(value) {", start);
assert.notEqual(start, -1, "premiumPrefixes helper must exist");
assert.notEqual(end, -1, "helper boundary must exist");
const helpers = new Function(source.slice(start, end) + "\nreturn { premiumPrefixes, isPremiumSource };")();

test("accepts paths inside a configured Premium directory", () => {
  const env = { PREMIUM_SOURCE_PREFIXES: "https://media.example/premium/channel/" };
  assert.equal(helpers.isPremiumSource(new URL("https://media.example/premium/channel/index.m3u8"), env), true);
  assert.equal(helpers.isPremiumSource(new URL("https://media.example/premium/channel/segment.ts"), env), true);
});

test("rejects sibling paths that only share a textual prefix", () => {
  const env = { PREMIUM_SOURCE_PREFIXES: "https://media.example/premium/channel" };
  assert.equal(helpers.isPremiumSource(new URL("https://media.example/premium/channel-extra/segment.ts"), env), false);
  assert.equal(helpers.isPremiumSource(new URL("https://media.example/premium/channel2/index.m3u8"), env), false);
});

test("rejects different origins and malformed prefixes", () => {
  const env = { PREMIUM_SOURCE_PREFIXES: "https://media.example/premium/channel/,not-a-url" };
  assert.equal(helpers.isPremiumSource(new URL("https://other.example/premium/channel/index.m3u8"), env), false);
  assert.equal(helpers.isPremiumSource(new URL("http://media.example/premium/channel/index.m3u8"), env), false);
});

test("supports multiple comma-separated Premium directories", () => {
  const env = { PREMIUM_SOURCE_PREFIXES: "https://one.example/a/, https://two.example/b/" };
  assert.equal(helpers.isPremiumSource(new URL("https://two.example/b/segment.ts"), env), true);
  assert.equal(helpers.isPremiumSource(new URL("https://two.example/c/segment.ts"), env), false);
});
