import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createAuthRouter } from "../src/auth.js";
import { Mother, User } from "../src/models.js";

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
  t.mock.method(User, "findOne", async () => user);
  t.mock.method(bcrypt, "compare", async () => true);

  const response = await request(createTestApp()).post("/api/auth/login").send({
    email,
    password: "password123"
  });

  assert.equal(response.status, 200);
  assert.ok(response.body.token);
  assert.equal(response.body.user.email, email);
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
