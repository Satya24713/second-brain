import test from "node:test";
import assert from "node:assert/strict";
import { seal, unseal } from "../lib/crypto.ts";
test("Keys are encrypted with randomized nonces and bound to their owner", async () => {
  const secret = crypto.randomUUID();
  const raw = "test-only-placeholder-credential";
  const a = await seal(raw, "alice", secret),
    b = await seal(raw, "alice", secret);
  assert.notEqual(a, b);
  assert.equal(a.includes(raw), false);
  assert.equal(await unseal(a, "alice", secret), raw);
  await assert.rejects(() => unseal(a, "bob", secret));
  await assert.rejects(() => unseal(a, "alice", "wrong-master-secret"));
  const parts = a.split(".");
  const binary = Buffer.from(parts[1], "base64");
  binary[0] ^= 1;
  await assert.rejects(() =>
    unseal(`${parts[0]}.${binary.toString("base64")}`, "alice", secret),
  );
});
