import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createAuthRouter, issueToken } from "../src/auth.js";
import { Mother, User, Visit } from "../src/models.js";

process.env.JWT_SECRET = "test-secret-for-password-reset";
process.env.TWILIO_ACCOUNT_SID = "ACtest";
process.env.TWILIO_AUTH_TOKEN = "test-token";
process.env.TWILIO_VERIFY_SERVICE_SID = "VAtest";

const email = "mother@test.local";
const phone = "+15551234567";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter(express, bcrypt));
  return app;
}

function createTestUser() {
  return {
    id: "507f1f77bcf86cd799439011",
    email,
    name: "Test Mother",
    phone,
    role: "mother",
    passwordHash: "old-password-hash",
    authVersion: 0,
    save: async function () { this.saved = true; }
  };
}

test("login succeeds with email and password without human verification", async (t) => {
  const user = createTestUser();
  user.preferredLanguage = "rw";
  t.mock.method(User, "findOne", async () => user);
  t.mock.method(bcrypt, "compare", async () => true);

  const response = await request(createTestApp()).post("/api/auth/login").send({
    email,
    password: "password123"
  });

  assert.equal(response.status, 200);
  assert.ok(response.body.token);
  assert.equal(response.body.user.email, email);
  assert.equal(response.body.user.preferredLanguage, "rw");
});

test("registration saves the selected language on the new account", async (t) => {
  let savedUser;
  t.mock.method(User, "exists", async () => false);
  t.mock.method(User, "create", async (details) => {
    savedUser = details;
    return { ...createTestUser(), ...details, id: "507f1f77bcf86cd799439011", authVersion: 0 };
  });
  t.mock.method(Mother, "create", async (details) => ({ ...details, id: "507f1f77bcf86cd799439012" }));
  t.mock.method(Visit, "insertMany", async () => []);
  t.mock.method(bcrypt, "hash", async () => "hashed:password123");

  const response = await request(createTestApp()).post("/api/auth/register").send({
    role: "mother",
    name: "Test Mother",
    email: "new-mother@test.local",
    password: "password123",
    phone,
    dueDate: new Date(Date.now() + 60 * 86400000).toISOString(),
    preferredLanguage: "fr"
  });

  assert.equal(response.status, 201);
  assert.equal(savedUser.preferredLanguage, "fr");
  assert.equal(response.body.user.preferredLanguage, "fr");
});

for (const role of ["mother", "nurse"]) {
  test(`${role} can update their own account details`, async (t) => {
    const user = createTestUser();
    user._id = user.id;
    user.role = role;
    let motherUpdateCount = 0;
    let motherUpdate;
    t.mock.method(User, "findById", () => ({ select: async () => user }));
    t.mock.method(User, "exists", async () => false);
    t.mock.method(Mother, "updateOne", async (...args) => {
      motherUpdateCount += 1;
      motherUpdate = args;
      return { matchedCount: 1 };
    });

    const response = await request(createTestApp())
      .patch("/api/auth/profile")
      .set("Authorization", `Bearer ${issueToken(user)}`)
      .send({ name: "Updated Name", email: "updated@test.local", phone: "+250788123456", role: "nurse" });

    assert.equal(response.status, 200);
    assert.equal(user.name, "Updated Name");
    assert.equal(user.email, "updated@test.local");
    assert.equal(user.phone, "+250788123456");
    assert.equal(user.role, role);
    assert.equal(response.body.user.role, role);
    assert.ok(response.body.token);
    assert.equal(motherUpdateCount, role === "mother" ? 1 : 0);
    if (role === "mother") {
      assert.deepEqual(motherUpdate, [
        { userId: user.id },
        { $set: { name: "Updated Name", phone: "+250788123456" } }
      ]);
    }
  });
}

test("a password change rejects an incorrect current password", async (t) => {
  const user = createTestUser();
  user._id = user.id;
  user.role = "nurse";
  t.mock.method(User, "findById", () => ({ select: async () => user }));
  t.mock.method(bcrypt, "compare", async () => false);

  const response = await request(createTestApp())
    .patch("/api/auth/profile")
    .set("Authorization", `Bearer ${issueToken(user)}`)
    .send({
      name: user.name,
      email: user.email,
      phone,
      currentPassword: "wrong-password",
      newPassword: "new-password-123"
    });

  assert.equal(response.status, 400);
  assert.equal(user.passwordHash, "old-password-hash");
  assert.equal(user.authVersion, 0);
  assert.equal(user.saved, undefined);
});

test("changing a password with the correct current password refreshes the session", async (t) => {
  const user = createTestUser();
  user._id = user.id;
  user.role = "nurse";
  t.mock.method(User, "findById", () => ({ select: async () => user }));
  t.mock.method(User, "exists", async () => false);
  t.mock.method(bcrypt, "compare", async (password) => password === "old-password");
  t.mock.method(bcrypt, "hash", async (password) => `hashed:${password}`);
  const app = createTestApp();
  const oldToken = issueToken(user);

  const response = await request(app)
    .patch("/api/auth/profile")
    .set("Authorization", `Bearer ${oldToken}`)
    .send({
      name: user.name,
      email: user.email,
      phone,
      currentPassword: "old-password",
      newPassword: "new-password-123"
    });

  assert.equal(response.status, 200);
  assert.equal(user.passwordHash, "hashed:new-password-123");
  assert.equal(user.authVersion, 1);
  assert.equal((await request(app).get("/api/auth/profile").set("Authorization", `Bearer ${oldToken}`)).status, 401);
  assert.equal((await request(app).get("/api/auth/profile").set("Authorization", `Bearer ${response.body.token}`)).status, 200);
});

test("account updates reject duplicate email addresses", async (t) => {
  const user = createTestUser();
  user._id = user.id;
  t.mock.method(User, "findById", () => ({ select: async () => user }));
  t.mock.method(User, "exists", async () => true);

  const response = await request(createTestApp())
    .patch("/api/auth/profile")
    .set("Authorization", `Bearer ${issueToken(user)}`)
    .send({ name: user.name, email: "taken@test.local", phone });

  assert.equal(response.status, 409);
  assert.equal(user.email, email);
});

test("users can save and retrieve a supported language preference", async (t) => {
  const user = createTestUser();
  user._id = user.id;
  t.mock.method(User, "findById", () => ({ select: async () => user }));

  const app = createTestApp();
  const authorization = `Bearer ${issueToken(user)}`;
  const updated = await request(app)
    .patch("/api/auth/profile")
    .set("Authorization", authorization)
    .send({ preferredLanguage: "rw" });

  assert.equal(updated.status, 200);
  assert.equal(user.preferredLanguage, "rw");
  assert.equal(updated.body.user.preferredLanguage, "rw");

  const profile = await request(app).get("/api/auth/profile").set("Authorization", authorization);
  assert.equal(profile.status, 200);
  assert.equal(profile.body.user.preferredLanguage, "rw");
});

test("accounts without a saved language use English by default", async (t) => {
  const user = createTestUser();
  user._id = user.id;
  t.mock.method(User, "findById", () => ({ select: async () => user }));

  const response = await request(createTestApp())
    .get("/api/auth/profile")
    .set("Authorization", `Bearer ${issueToken(user)}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.user.preferredLanguage, "en");
});

test("account updates reject unsupported language preferences", async (t) => {
  const user = createTestUser();
  user._id = user.id;
  t.mock.method(User, "findById", () => ({ select: async () => user }));

  const response = await request(createTestApp())
    .patch("/api/auth/profile")
    .set("Authorization", `Bearer ${issueToken(user)}`)
    .send({ preferredLanguage: "es" });

  assert.equal(response.status, 400);
  assert.equal(user.preferredLanguage, undefined);
  assert.equal(user.saved, undefined);
});

test("SMS verification code updates the password and invalidates existing tokens", async (t) => {
  const user = createTestUser();
  const calls = [];
  t.mock.method(User, "findOne", async (query) => query.email === email ? user : null);
  t.mock.method(Mother, "findOne", async () => null);
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url: String(url), options });
    const status = String(url).endsWith("/VerificationCheck") ? "approved" : "pending";
    return { ok: true, status: 200, json: async () => ({ status }) };
  });
  const app = createTestApp();

  const requested = await request(app).post("/api/auth/forgot-password").send({ email, phone });
  assert.equal(requested.status, 200);
  assert.match(requested.body.message, /If those details match an account/);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/Verifications$/);
  assert.equal(new URLSearchParams(calls[0].options.body).get("To"), phone);

  const reset = await request(app).post("/api/auth/reset-password").send({
    email,
    phone,
    code: "123456",
    newPassword: "new-password-123"
  });
  assert.equal(reset.status, 200);
  assert.equal(user.saved, true);
  assert.equal(user.authVersion, 1);
  assert.equal(await bcrypt.compare("new-password-123", user.passwordHash), true);
  assert.equal(String(calls[1].url).endsWith("/VerificationCheck"), true);
  assert.equal(new URLSearchParams(calls[1].options.body).get("Code"), "123456");
});

test("a registered account with a different phone number does not receive an SMS", async (t) => {
  const user = createTestUser();
  user.phone = "+15557654321";
  let smsRequests = 0;
  t.mock.method(User, "findOne", async () => user);
  t.mock.method(globalThis, "fetch", async () => {
    smsRequests += 1;
    return { ok: true, status: 200, json: async () => ({ status: "pending" }) };
  });
  const app = createTestApp();

  const response = await request(app).post("/api/auth/forgot-password").send({ email, phone });
  assert.equal(response.status, 200);
  assert.match(response.body.message, /If those details match an account/);
  assert.equal(smsRequests, 0);
});

test("unapproved SMS codes do not update the password", async (t) => {
  const user = createTestUser();
  t.mock.method(User, "findOne", async () => user);
  t.mock.method(Mother, "findOne", async () => null);
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: "pending" })
  }));
  const app = createTestApp();

  const response = await request(app).post("/api/auth/reset-password").send({
    email,
    phone,
    code: "000000",
    newPassword: "new-password-123"
  });
  assert.equal(response.status, 400);
  assert.equal(user.passwordHash, "old-password-hash");
  assert.equal(user.saved, undefined);
});

test("SMS provider failures are reported without exposing provider details", async (t) => {
  const user = createTestUser();
  t.mock.method(User, "findOne", async () => user);
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 500, json: async () => ({ message: "private provider detail" }) }));
  const app = createTestApp();

  const response = await request(app).post("/api/auth/forgot-password").send({ email, phone });
  assert.equal(response.status, 502);
  assert.equal(response.body.error, "Could not complete SMS verification. Try again or contact support.");
  assert.doesNotMatch(JSON.stringify(response.body), /private provider detail/);
});
