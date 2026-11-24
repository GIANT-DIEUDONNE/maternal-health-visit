import { createHmac, timingSafeEqual } from "node:crypto";

const defaultReply = "Thank you for contacting us. What can I help you with?";

function isValidSignature(signature, rawBody, appSecret) {
  const match = /^sha256=([a-f0-9]{64})$/i.exec(signature || "");
  if (!match || !Buffer.isBuffer(rawBody)) return false;
  const received = Buffer.from(match[1], "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function inboundMessages(body) {
  if (!Array.isArray(body?.entry)) return [];
  return body.entry.flatMap((entry) => Array.isArray(entry?.changes)
    ? entry.changes.flatMap((change) => change?.field === "messages" && Array.isArray(change.value?.messages)
      ? change.value.messages.filter((message) =>
        typeof message?.id === "string" &&
        typeof message?.from === "string" &&
        /^\d{7,15}$/.test(message.from))
      : [])
    : []);
}

export function createWhatsAppWebhook(express, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console
} = {}) {
  const router = express.Router();
  const handledMessageIds = new Map();

  router.get("/", (req, res) => {
    if (!env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(503).send("WhatsApp webhook is not configured.");
    }

    const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
    if (mode !== "subscribe" || token !== env.WHATSAPP_VERIFY_TOKEN || typeof challenge !== "string") {
      return res.sendStatus(403);
    }
    return res.status(200).type("text/plain").send(challenge);
  });

  router.post("/", async (req, res) => {
    const { WHATSAPP_APP_SECRET: appSecret, WHATSAPP_ACCESS_TOKEN: accessToken,
      WHATSAPP_PHONE_NUMBER_ID: phoneNumberId, WHATSAPP_GRAPH_API_VERSION: graphApiVersion } = env;

    if (!appSecret || !accessToken || !phoneNumberId || !/^v\d+\.\d+$/.test(graphApiVersion || "")) {
      return res.status(503).json({ error: "WhatsApp webhook is not configured." });
    }
    if (!isValidSignature(req.get("x-hub-signature-256"), req.rawBody, appSecret)) {
      return res.sendStatus(401);
    }

    const messages = inboundMessages(req.body);
    if (messages.length === 0) return res.sendStatus(200);

    const now = Date.now();
    for (const [messageId, timestamp] of handledMessageIds) {
      if (now - timestamp > 24 * 60 * 60 * 1000) handledMessageIds.delete(messageId);
    }

    const graphUrl = `https://graph.facebook.com/${graphApiVersion}/${encodeURIComponent(phoneNumberId)}/messages`;
    for (const message of messages) {
      if (handledMessageIds.has(message.id)) continue;
      handledMessageIds.set(message.id, now);
      if (handledMessageIds.size > 5000) {
        handledMessageIds.delete(handledMessageIds.keys().next().value);
      }

      try {
        const response = await fetchImpl(graphUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: message.from,
            type: "text",
            text: { preview_url: false, body: env.WHATSAPP_AUTO_REPLY || defaultReply }
          })
        });
        if (!response.ok) {
          handledMessageIds.delete(message.id);
          logger.error(`WhatsApp reply request failed with status ${response.status}.`);
          return res.status(502).json({ error: "Could not send the WhatsApp automatic reply." });
        }
      } catch (error) {
        handledMessageIds.delete(message.id);
        logger.error("WhatsApp reply request failed.", error);
        return res.status(502).json({ error: "Could not send the WhatsApp automatic reply." });
      }
    }

    return res.sendStatus(200);
  });

  return router;
}
