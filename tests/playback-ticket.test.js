const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { decodeTicket, isWithinChannelRoot } = require("../api/_lib/playbackTicket");

const secret = "test-secret-for-playback-ticket-tests-32chars";
function issue(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return encoded + "." + signature;
}
function payload(overrides = {}) {
  return {
    v: 1,
    channelId: "test-premium-channel",
    uid: "firebase-test-user",
    host: "88.212.15.19",
    rootPath: "/live/channel/",
    exp: Math.floor(Date.now() / 1000) + 60,
    nonce: "test-nonce",
    ...overrides
  };
}

test("accepts a valid, unexpired signed ticket", () => {
  const ticket = issue(payload());
  assert.equal(decodeTicket(ticket, secret).channelId, "test-premium-channel");
});

test("rejects a tampered signature", () => {
  const ticket = issue(payload());
  const [encoded, signature] = ticket.split(".");
  const replacement = signature[0] === "A" ? "B" : "A";
  assert.equal(decodeTicket(encoded + "." + replacement + signature.slice(1), secret), null);
});

test("rejects expired tickets", () => {
  assert.equal(decodeTicket(issue(payload({ exp: Math.floor(Date.now() / 1000) - 1 })), secret), null);
});

test("rejects tickets signed with another secret", () => {
  assert.equal(decodeTicket(issue(payload()), "different-secret-that-is-long-enough-32"), null);
});

test("rejects malformed payloads and weak server secrets", () => {
  assert.equal(decodeTicket("not-a-ticket", secret), null);
  assert.equal(decodeTicket(issue({ v: 1 }), secret), null);
  assert.equal(decodeTicket(issue(payload()), "short"), null);
});

test("limits a ticket to its authorized source directory", () => {
  const source = "https://88.212.15.19/live/channel/index.m3u8";
  assert.equal(isWithinChannelRoot(new URL("https://88.212.15.19/live/channel/segment.ts"), source), true);
  assert.equal(isWithinChannelRoot(new URL("https://88.212.15.19/live/other/segment.ts"), source), false);
  assert.equal(isWithinChannelRoot(new URL("https://154.58.202.18/live/channel/segment.ts"), source), false);
});
