import jwt from "jsonwebtoken";
import { z } from "zod";
import { User, Mother, Visit } from "./models.js";
import { calculateVisitDates } from "./schedule.js";

const phoneSchema = z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Enter an international phone number starting with + and the country code.");
const preferredLanguageSchema = z.enum(["en", "rw", "fr"]);
const registerSchema = z.object({
  role: z.enum(["nurse", "mother"]).default("mother"),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(100),
  preferredLanguage: preferredLanguageSchema.default("en"),
  phone: phoneSchema.optional(),
  dueDate: z.coerce.date().optional(),
  nurseRegistrationCode: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1)
});
const passwordResetRequestSchema = z.object({
  email: z.string().trim().email().max(254),
  phone: phoneSchema
});
const passwordResetSchema = passwordResetRequestSchema.extend({
  code: z.string().trim().regex(/^\d{4,10}$/),
  newPassword: z.string().min(8).max(100)
});
const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email().max(254).optional(),
  phone: phoneSchema.optional(),
  preferredLanguage: preferredLanguageSchema.optional(),
  currentPassword: z.string().min(1).max(100).optional(),
  newPassword: z.string().min(8).max(100).optional()
})
  .refine((input) => Boolean(input.currentPassword) === Boolean(input.newPassword), {
    message: "Current and new passwords must be provided together."
  })
  .refine((input) => Boolean(
    input.name
    || input.email
    || input.phone
    || input.preferredLanguage
    || input.newPassword
  ), {
    message: "At least one account field must be provided."
  });

class SmsGatewayError extends Error {}

function isTwilioConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID);
}

async function requestTwilioVerification(action, values) {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
  const credentials = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const url = `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/${action}`;
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams(values)
    });
    if (action === "VerificationCheck" && response.status === 404) return null;
    if (!response.ok) throw new SmsGatewayError();
    return await response.json();
  } catch (error) {
    if (error instanceof SmsGatewayError) throw error;
    throw new SmsGatewayError();
  }
}

async function findUserForPasswordReset(email, phone) {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) return null;
  const mother = !user.phone && user.role === "mother" ? await Mother.findOne({ userId: user.id }) : null;
  const registeredPhone = user.phone || mother?.phone;
  return registeredPhone === phone ? user : null;
}

function respondToSmsError(error, res, next) {
  if (!(error instanceof SmsGatewayError)) return next(error);
  console.error("Twilio Verify request failed.");
  return res.status(502).json({ error: "Could not complete SMS verification. Try again or contact support." });
}

export function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, authVersion: user.authVersion || 0 }, process.env.JWT_SECRET, { expiresIn: "12h" });
}

export async function requireAuth(req, res, next) {
  const token = req.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: "Authentication required." });
  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid or expired access token." });
  }
  try {
    const user = await User.findById(claims.sub).select("role authVersion");
    if (!user) return res.status(401).json({ error: "Account is no longer available." });
    if ((claims.authVersion || 0) !== user.authVersion) return res.status(401).json({ error: "Invalid or expired access token." });
    req.auth = { ...claims, role: user.role };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.auth.role)) return res.status(403).json({ error: "Your role cannot perform this action." });
    next();
  };
}

export function createAuthRouter(express, bcrypt) {
  const router = express.Router();

  router.post("/register", async (req, res, next) => {
    const input = registerSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Invalid registration details.", details: input.error.flatten() });
    const { role, name, email: submittedEmail, password, phone, dueDate, nurseRegistrationCode, preferredLanguage } = input.data;
    if (!phone) {
      return res.status(400).json({ error: "A phone number in international format is required." });
    }
    if (role === "mother" && !dueDate) {
      return res.status(400).json({ error: "Mother registration requires a due date." });
    }
    if (role === "nurse") {
      if (!process.env.NURSE_REGISTRATION_CODE) {
        return res.status(503).json({ error: "Nurse registration is not configured." });
      }
      if (nurseRegistrationCode !== process.env.NURSE_REGISTRATION_CODE) {
        return res.status(403).json({ error: "A valid Nurse registration code is required." });
      }
    }
    try {
      const email = submittedEmail.toLowerCase();
      if (await User.exists({ email })) return res.status(400).json({ error: "An account with this email already exists." });
      if (role === "mother" && dueDate <= new Date()) return res.status(400).json({ error: "Due date must be in the future." });
      const user = await User.create({
        name,
        email,
        passwordHash: await bcrypt.hash(password, 12),
        role,
        phone,
        preferredLanguage
      });
      if (role === "mother") {
        const mother = await Mother.create({ name, dueDate, phone, userId: user.id });
        await Visit.insertMany(calculateVisitDates(mother.dueDate).map((visit) => ({ ...visit, motherId: mother.id })));
      }
      res.status(201).json({
        token: issueToken(user),
        user: { id: user.id, name: user.name, email: user.email, role: user.role, preferredLanguage: user.preferredLanguage }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/login", async (req, res, next) => {
    const input = loginSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Email and password are required." });
    try {
      const user = await User.findOne({ email: input.data.email.toLowerCase() });
      if (!user || !(await bcrypt.compare(input.data.password, user.passwordHash))) {
        return res.status(401).json({ error: "Email or password is incorrect." });
      }
      res.json({
        token: issueToken(user),
        user: { id: user.id, name: user.name, email: user.email, role: user.role, preferredLanguage: user.preferredLanguage || "en" }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/profile", requireAuth, async (req, res, next) => {
    try {
      const user = await User.findById(req.auth.sub).select("name email phone role preferredLanguage");
      if (!user) return res.status(404).json({ error: "Account is no longer available." });
      let phone = user.phone || "";
      if (!phone && user.role === "mother") {
        const mother = await Mother.findOne({ userId: user.id }).select("phone");
        phone = mother?.phone || "";
      }
      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone,
          role: user.role,
          preferredLanguage: user.preferredLanguage || "en"
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/profile", requireAuth, async (req, res, next) => {
    const input = profileUpdateSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Enter valid account details and a password change if needed." });
    try {
      const user = await User.findById(req.auth.sub).select("name email phone role preferredLanguage passwordHash authVersion");
      if (!user) return res.status(404).json({ error: "Account is no longer available." });
      const email = input.data.email?.toLowerCase();
      if (email && email !== user.email && await User.exists({ email, _id: { $ne: user._id } })) {
        return res.status(409).json({ error: "An account with this email already exists." });
      }
      if (input.data.newPassword) {
        if (!(await bcrypt.compare(input.data.currentPassword, user.passwordHash))) {
          return res.status(400).json({ error: "Current password is incorrect." });
        }
        user.passwordHash = await bcrypt.hash(input.data.newPassword, 12);
        user.authVersion = (user.authVersion || 0) + 1;
      }
      if (input.data.name) user.name = input.data.name;
      if (email) user.email = email;
      if (input.data.phone) user.phone = input.data.phone;
      if (input.data.preferredLanguage) user.preferredLanguage = input.data.preferredLanguage;
      await user.save();
      if (user.role === "mother" && (input.data.name || input.data.phone)) {
        const motherUpdates = {};
        if (input.data.name) motherUpdates.name = user.name;
        if (input.data.phone) motherUpdates.phone = user.phone;
        await Mother.updateOne({ userId: user.id }, { $set: motherUpdates });
      }
      res.json({
        token: issueToken(user),
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          preferredLanguage: user.preferredLanguage || "en"
        }
      });
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ error: "An account with this email already exists." });
      next(error);
    }
  });

  router.post("/forgot-password", async (req, res, next) => {
    const input = passwordResetRequestSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Enter a valid email address and phone number in international format." });
    if (!isTwilioConfigured()) return res.status(503).json({ error: "SMS password recovery is not configured. Contact support." });
    try {
      const user = await findUserForPasswordReset(input.data.email, input.data.phone);
      if (user) {
        await requestTwilioVerification("Verifications", { To: input.data.phone, Channel: "sms" });
      }
      res.json({ message: "If those details match an account, a verification code has been sent." });
    } catch (error) {
      respondToSmsError(error, res, next);
    }
  });

  router.post("/reset-password", async (req, res, next) => {
    const input = passwordResetSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Enter a valid email, phone number, verification code, and new password." });
    if (!isTwilioConfigured()) return res.status(503).json({ error: "SMS password recovery is not configured. Contact support." });
    try {
      const user = await findUserForPasswordReset(input.data.email, input.data.phone);
      if (!user) return res.status(400).json({ error: "The account details or verification code are incorrect or expired." });
      const verification = await requestTwilioVerification("VerificationCheck", {
        To: input.data.phone,
        Code: input.data.code
      });
      if (verification?.status !== "approved") {
        return res.status(400).json({ error: "The account details or verification code are incorrect or expired." });
      }
      user.passwordHash = await bcrypt.hash(input.data.newPassword, 12);
      user.authVersion = (user.authVersion || 0) + 1;
      await user.save();
      res.json({ message: "Your password has been updated." });
    } catch (error) {
      respondToSmsError(error, res, next);
    }
  });

  return router;
}
