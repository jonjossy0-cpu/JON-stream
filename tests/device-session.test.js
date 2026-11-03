const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidSessionId, hashSessionId, applySessionAction } = require("../api/_lib/deviceSession");

function createFakeFirestore() {
  const records = new Map();
  const db = {
    collection(name) {
      assert.equal(name, "activeUserSessions");
      return {
        doc(uid) {
          return { id: uid };
        }
      };
    },
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        async get(ref) {
          const value = records.get(ref.id);
          return { exists: value !== undefined, data: () => value && { ...value } };
        },
        set(ref, value) { writes.push(() => records.set(ref.id, { ...value })); },
        update(ref, value) {
          writes.push(() => records.set(ref.id, { ...records.get(ref.id), ...value }));
        },
        delete(ref) { writes.push(() => records.delete(ref.id)); }
      };
      const result = await callback(transaction);
      writes.forEach(write => write());
      return result;
    }
  };
  return { db, records };
}

const FieldValue = { serverTimestamp: () => "server-time" };
const idA = "a".repeat(64);
const idB = "b".repeat(64);

test("accepts only 64-character hexadecimal session IDs", () => {
  assert.equal(isValidSessionId(idA), true);
  assert.equal(isValidSessionId(idB), true);
  assert.equal(isValidSessionId("short"), false);
  assert.equal(isValidSessionId("g".repeat(64)), false);
});

test("hashes session IDs deterministically without storing the raw ID", () => {
  assert.equal(hashSessionId(idA), hashSessionId(idA));
  assert.notEqual(hashSessionId(idA), hashSessionId(idB));
  assert.notEqual(hashSessionId(idA), idA);
});

test("a second device must be confirmed before replacing the active session", async () => {
  const { db, records } = createFakeFirestore();
  const first = await applySessionAction({ db, uid: "user-1", sessionId: idA, action: "claim", FieldValue });
  const declined = await applySessionAction({ db, uid: "user-1", sessionId: idB, action: "claim", FieldValue });
  assert.deepEqual(first, { active: true, replaced: false });
  assert.deepEqual(declined, { active: false, confirmationRequired: true, replaced: false });
  assert.equal(records.get("user-1").sessionIdHash, hashSessionId(idA));

  const accepted = await applySessionAction({
    db, uid: "user-1", sessionId: idB, action: "claim", FieldValue, confirm: true
  });
  assert.deepEqual(accepted, { active: true, replaced: true });
  assert.equal(records.get("user-1").sessionIdHash, hashSessionId(idB));
});

test("only the current device can check or release the active session", async () => {
  const { db, records } = createFakeFirestore();
  await applySessionAction({ db, uid: "user-1", sessionId: idA, action: "claim", FieldValue });
  assert.deepEqual(
    await applySessionAction({ db, uid: "user-1", sessionId: idB, action: "check", FieldValue }),
    { active: false }
  );
  assert.deepEqual(
    await applySessionAction({ db, uid: "user-1", sessionId: idB, action: "release", FieldValue }),
    { active: false, released: false }
  );
  assert.equal(records.has("user-1"), true);
  assert.deepEqual(
    await applySessionAction({ db, uid: "user-1", sessionId: idA, action: "check", FieldValue }),
    { active: true }
  );
  assert.deepEqual(
    await applySessionAction({ db, uid: "user-1", sessionId: idA, action: "release", FieldValue }),
    { active: false, released: true }
  );
  assert.equal(records.has("user-1"), false);
});
