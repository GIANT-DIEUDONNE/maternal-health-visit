import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createAuthRouter } from "../src/auth.js";
import { User } from "../src/models.js";

process.env.JWT_SECRET = "test-secret-for-turnstile-login";
process.env.TURNSTILE_SECRET_KEY = "test-turnstile-secret";
process.env.TURNSTILE_EXPECTED_HOSTNAME = "maternal-health.test";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter(express, bcrypt));
  return app;
}

function loginBody(turnstileToken = "test-token") {
  return { email: "mother@test.local", password: "password123", turnstileToken };
}

test("login validates the Turnstile token and hostname before authenticating", async (t) => {
  let verifiedRequest;
  const user = {
    id: "507f1f77bcf86cd799439011",
    email: "mother@test.local",
    name: "Test Mother",
    role: "mother",
    authVersion: 0
  };
  t.mock.method(globalThis, "fetch", async (url, options) => {
    verifiedRequest = { url: String(url), body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ success: true, hostname: "maternal-health.test" }) };
  });
  t.mock.method(User, "findOne", async () => user);
  t.mock.method(bcrypt, "compare", async () => true);

  const response = await request(createTestApp()).post("/api/auth/login").send(loginBody());

  assert.equal(response.status, 200);
  assert.ok(response.body.token);
  assert.equal(verifiedRequest.url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.deepEqual(verifiedRequest.body, { secret: "test-turnstile-secret", response: "test-token" });
});

test("login rejects Turnstile responses for an unexpected hostname", async (t) => {
  let accountLookups = 0;
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ success: true, hostname: "attacker.example" })
  }));
  t.mock.method(User, "findOne", async () => {
    accountLookups += 1;
    return null;
  });

  const response = await request(createTestApp()).post("/api/auth/login").send(loginBody());

  assert.equal(response.status, 400);
  assert.match(response.body.error, /Human verification failed/);
  assert.equal(accountLookups, 0);
});

test("login fails closed when Turnstile configuration is missing", async (t) => {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const hostname = process.env.TURNSTILE_EXPECTED_HOSTNAME;
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_EXPECTED_HOSTNAME;
  t.after(() => {
    process.env.TURNSTILE_SECRET_KEY = secret;
    process.env.TURNSTILE_EXPECTED_HOSTNAME = hostname;
  });
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Siteverify must not be called without configuration");
  });

  const response = await request(createTestApp()).post("/api/auth/login").send(loginBody());

  assert.equal(response.status, 503);
  assert.match(response.body.error, /not configured/);
});

test("login fails closed when Turnstile is unavailable", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 503 }));
  const errors = [];
  t.mock.method(console, "error", (...args) => errors.push(args));

  const response = await request(createTestApp()).post("/api/auth/login").send(loginBody());

  assert.equal(response.status, 502);
  assert.match(response.body.error, /temporarily unavailable/);
  assert.equal(errors.length, 1);
});
