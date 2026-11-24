import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { createWhatsAppWebhook } from "../src/whatsapp.js";

const config = {
  WHATSAPP_APP_SECRET: "test-app-secret",
  WHATSAPP_VERIFY_TOKEN: "test-verify-token",
  WHATSAPP_ACCESS_TOKEN: "test-access-token",
  WHATSAPP_PHONE_NUMBER_ID: "123456789",
  WHATSAPP_GRAPH_API_VERSION: "v23.0"
};

function createTestApp(options = {}) {
  const app = express();
  app.use(express.json({
    verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); }
  }));
  app.use("/api/webhooks/whatsapp", createWhatsAppWebhook(express, { env: config, ...options }));
  return app;
}

function signature(body) {
  return `sha256=${createHmac("sha256", config.WHATSAPP_APP_SECRET).update(JSON.stringify(body)).digest("hex")}`;
}

test("WhatsApp webhook verifies Meta's callback token", async () => {
  const response = await request(createTestApp())
    .get("/api/webhooks/whatsapp")
    .query({ "hub.mode": "subscribe", "hub.verify_token": config.WHATSAPP_VERIFY_TOKEN, "hub.challenge": "challenge-value" });

  assert.equal(response.status, 200);
  assert.equal(response.text, "challenge-value");
});

test("signed incoming messages receive the configured automatic reply", async () => {
  let sent;
  const app = createTestApp({
    fetchImpl: async (url, options) => {
      sent = { url, options };
      return { ok: true, status: 200 };
    },
    logger: { error() {} }
  });
  const body = {
    entry: [{
      changes: [{
        field: "messages",
        value: { messages: [{ id: "wamid.test-message", from: "250790684556", type: "text" }] }
      }]
    }]
  };

  const response = await request(app)
    .post("/api/webhooks/whatsapp")
    .set("x-hub-signature-256", signature(body))
    .send(body);

  assert.equal(response.status, 200);
  assert.equal(sent.url, `https://graph.facebook.com/${config.WHATSAPP_GRAPH_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`);
  assert.equal(sent.options.headers.Authorization, `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`);
  assert.deepEqual(JSON.parse(sent.options.body), {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "250790684556",
    type: "text",
    text: { preview_url: false, body: "Thank you for contacting us. What can I help you with?" }
  });
});

test("invalid webhook signatures are rejected without sending a reply", async () => {
  let sends = 0;
  const body = {
    entry: [{
      changes: [{
        field: "messages",
        value: { messages: [{ id: "wamid.invalid", from: "250790684556", type: "text" }] }
      }]
    }]
  };
  const response = await request(createTestApp({
    fetchImpl: async () => { sends += 1; return { ok: true, status: 200 }; },
    logger: { error() {} }
  }))
    .post("/api/webhooks/whatsapp")
    .set("x-hub-signature-256", "sha256=invalid")
    .send(body);

  assert.equal(response.status, 401);
  assert.equal(sends, 0);
});
