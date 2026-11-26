import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, requireRole } from "./auth.js";
import { Mother, SystemSetting, User, Visit } from "./models.js";
import { calculateVisitDates, startOfUtcDay } from "./schedule.js";

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  role: z.enum(["admin", "nurse", "mother"]).optional(),
  active: z.enum(["true", "false"]).optional()
});
const userInputSchema = z.object({
  role: z.enum(["nurse", "mother"]),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(100),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/),
  dueDate: z.coerce.date().optional()
});
const userUpdateSchema = z.object({
  role: z.enum(["admin", "nurse", "mother"]).optional(),
  isActive: z.boolean().optional()
}).strict().refine((input) => input.role !== undefined || input.isActive !== undefined);
const registrationCodeSchema = z.object({
  nurseRegistrationCode: z.string().trim().min(8).max(128)
}).strict();

function isValidId(id) {
  return mongoose.isValidObjectId(id);
}

function parsePage(query) {
  const parsed = pageSchema.safeParse(query);
  return parsed.success ? parsed.data : null;
}

export function createAdminRouter(express, bcrypt) {
  const router = express.Router();
  router.use(requireAuth, requireRole("admin"));

  router.get("/overview", async (_req, res, next) => {
    try {
      const today = startOfUtcDay(new Date());
      const motherIds = await Mother.distinct("_id", { isSample: { $ne: true } });
      const visitScope = { motherId: { $in: motherIds } };
      const missedFilter = { ...visitScope, visitDate: { $lt: today }, completedAt: null };
      const [
        totalUsers,
        activeUsers,
        inactiveUsers,
        adminAccounts,
        nurseAccounts,
        motherAccounts,
        motherRecords,
        missedVisits,
        completedVisits,
        upcomingVisits
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ isActive: { $in: [true, null] } }),
        User.countDocuments({ isActive: false }),
        User.countDocuments({ role: "admin" }),
        User.countDocuments({ role: "nurse" }),
        User.countDocuments({ role: "mother" }),
        Mother.countDocuments({ isSample: { $ne: true } }),
        Visit.countDocuments(missedFilter),
        Visit.countDocuments({ ...visitScope, completedAt: { $ne: null } }),
        Visit.countDocuments({ ...visitScope, visitDate: { $gte: today }, completedAt: null })
      ]);
      res.json({
        summary: {
          totalUsers,
          activeUsers,
          inactiveUsers,
          adminAccounts,
          nurseAccounts,
          motherAccounts,
          motherRecords,
          missedVisits,
          completedVisits,
          upcomingVisits
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/missed-visits", async (req, res, next) => {
    const page = parsePage(req.query);
    if (!page) return res.status(400).json({ error: "Invalid missed visit pagination." });
    try {
      const motherIds = await Mother.distinct("_id", { isSample: { $ne: true } });
      const filter = {
        motherId: { $in: motherIds },
        visitDate: { $lt: startOfUtcDay(new Date()) },
        completedAt: null
      };
      const [visits, total] = await Promise.all([
        Visit.find(filter).populate("motherId", "name phone").sort({ visitDate: 1 }).skip((page.page - 1) * page.limit).limit(page.limit).lean(),
        Visit.countDocuments(filter)
      ]);
      res.json({
        data: visits.filter((visit) => visit.motherId),
        pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/users", async (req, res, next) => {
    const page = parsePage(req.query);
    if (!page) return res.status(400).json({ error: "Invalid user list filters." });
    const filter = {};
    if (page.role) filter.role = page.role;
    if (page.active === "true") filter.isActive = { $in: [true, null] };
    if (page.active === "false") filter.isActive = false;
    try {
      const [users, total] = await Promise.all([
        User.find(filter).select("name email phone role isActive createdAt").sort({ createdAt: -1 }).skip((page.page - 1) * page.limit).limit(page.limit).lean(),
        User.countDocuments(filter)
      ]);
      const usersWithCarePlans = users.length
        ? new Set((await Mother.distinct("userId", { userId: { $in: users.map((user) => user._id) } })).map(String))
        : new Set();
      res.json({
        data: users.map((user) => ({ ...user, hasCarePlan: usersWithCarePlans.has(String(user._id)) })),
        pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/users", async (req, res, next) => {
    const input = userInputSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Enter valid account details and a password of at least 8 characters." });
    const { role, name, email: submittedEmail, password, phone, dueDate } = input.data;
    if (role === "mother" && !dueDate) return res.status(400).json({ error: "Mother accounts require an expected due date." });
    if (role === "nurse" && dueDate) return res.status(400).json({ error: "Due dates can only be set for mother accounts." });
    if (role === "mother" && dueDate <= new Date()) return res.status(400).json({ error: "Due date must be in the future." });
    try {
      const email = submittedEmail.toLowerCase();
      if (await User.exists({ email })) return res.status(409).json({ error: "An account with this email already exists." });
      const user = await User.create({
        role,
        name,
        email,
        phone,
        passwordHash: await bcrypt.hash(password, 12)
      });
      if (role === "mother") {
        const mother = await Mother.create({ name, dueDate, phone, userId: user.id });
        await Visit.insertMany(calculateVisitDates(dueDate).map((visit) => ({ ...visit, motherId: mother.id })));
      }
      res.status(201).json({
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, isActive: user.isActive }
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/users/:id", async (req, res, next) => {
    if (!isValidId(req.params.id)) return res.status(404).json({ error: "Account not found." });
    const input = userUpdateSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Select a valid role or account status." });
    if (req.params.id === req.auth.sub) return res.status(400).json({ error: "You cannot change your own role or account status." });
    try {
      const user = await User.findById(req.params.id).select("name email phone role isActive authVersion");
      if (!user) return res.status(404).json({ error: "Account not found." });
      const nextRole = input.data.role ?? user.role;
      const nextActive = input.data.isActive ?? user.isActive;
      if (nextRole === "mother" && user.role !== "mother" && !(await Mother.exists({ userId: user.id }))) {
        return res.status(400).json({ error: "Create a mother account with a due date before assigning the mother role." });
      }
      const removingActiveAdmin = user.role === "admin" && user.isActive !== false
        && (nextRole !== "admin" || nextActive === false);
      if (removingActiveAdmin && await User.countDocuments({ role: "admin", isActive: true }) <= 1) {
        return res.status(409).json({ error: "The last active administrator cannot be demoted or deactivated." });
      }
      const changed = nextRole !== user.role || nextActive !== user.isActive;
      user.role = nextRole;
      user.isActive = nextActive;
      if (changed) user.authVersion = (user.authVersion || 0) + 1;
      await user.save();
      res.json({
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, isActive: user.isActive }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/mothers", async (req, res, next) => {
    const page = parsePage(req.query);
    if (!page) return res.status(400).json({ error: "Invalid mother list pagination." });
    const filter = { isSample: { $ne: true } };
    try {
      const [mothers, total] = await Promise.all([
        Mother.find(filter).populate("userId", "name email isActive").sort({ name: 1 }).skip((page.page - 1) * page.limit).limit(page.limit).lean(),
        Mother.countDocuments(filter)
      ]);
      res.json({
        data: mothers,
        pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/settings", async (_req, res, next) => {
    try {
      const settings = await SystemSetting.findOne({ key: "system" }).select("nurseRegistrationCodeHash").lean();
      res.json({ nurseRegistrationCodeConfigured: Boolean(settings?.nurseRegistrationCodeHash) });
    } catch (error) {
      next(error);
    }
  });

  router.put("/settings/nurse-registration-code", async (req, res, next) => {
    const input = registrationCodeSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "The nurse registration code must be between 8 and 128 characters." });
    try {
      const nurseRegistrationCodeHash = await bcrypt.hash(input.data.nurseRegistrationCode, 12);
      await SystemSetting.findOneAndUpdate(
        { key: "system" },
        { $set: { nurseRegistrationCodeHash } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
      res.json({ nurseRegistrationCodeConfigured: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
