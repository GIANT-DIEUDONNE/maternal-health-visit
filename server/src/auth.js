import jwt from "jsonwebtoken";
import { z } from "zod";
import { User, Mother, Visit } from "./models.js";
import { calculateVisitDates } from "./schedule.js";

const registerSchema = z.object({
  role: z.enum(["nurse", "mother"]).default("mother"),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(100),
  phone: z.string().trim().min(7).max(30).optional(),
  dueDate: z.coerce.date().optional(),
  nurseRegistrationCode: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1)
});

export function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "12h" });
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
    const user = await User.findById(claims.sub).select("role");
    if (!user) return res.status(401).json({ error: "Account is no longer available." });
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
    const { role, name, email: submittedEmail, password, phone, dueDate, nurseRegistrationCode } = input.data;
    if (role === "mother" && (!phone || !dueDate)) {
      return res.status(400).json({ error: "Mother registration requires a phone number and due date." });
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
        role
      });
      if (role === "mother") {
        const mother = await Mother.create({ name, dueDate, phone, userId: user.id });
        await Visit.insertMany(calculateVisitDates(mother.dueDate).map((visit) => ({ ...visit, motherId: mother.id })));
      }
      res.status(201).json({ token: issueToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
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
      res.json({ token: issueToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
