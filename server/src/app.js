import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { z } from "zod";
import { User, Mother, Visit } from "./models.js";
import { createAuthRouter, requireAuth, requireRole } from "./auth.js";
import { calculateVisitDates, canLogVisit, isMissed, startOfUtcDay } from "./schedule.js";

const motherInput = z.object({
  name: z.string().trim().min(2).max(100),
  dueDate: z.coerce.date(),
  phone: z.string().trim().min(7).max(30)
});
const pageInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

function paginated(query) {
  const parsed = pageInput.safeParse(query);
  return parsed.success ? parsed.data : null;
}

function serializedVisit(visit, now) {
  const item = visit.toObject ? visit.toObject() : visit;
  return { ...item, missed: isMissed(item, now) };
}

function isValidId(id) {
  return mongoose.isValidObjectId(id);
}

export function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
  app.use(express.json({ limit: "20kb" }));

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/auth", createAuthRouter(express, bcrypt));

  app.get("/api/mothers", requireAuth, async (req, res, next) => {
    const page = paginated(req.query);
    if (!page) return res.status(400).json({ error: "Page must be positive and limit must be between 1 and 100." });
    try {
      const filter = req.auth.role === "nurse" ? {} : { userId: req.auth.sub };
      const [mothers, total] = await Promise.all([
        Mother.find(filter).sort({ name: 1 }).skip((page.page - 1) * page.limit).limit(page.limit).lean(),
        Mother.countDocuments(filter)
      ]);
      res.json({ data: mothers, pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) } });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/mothers", requireAuth, requireRole("nurse"), async (req, res, next) => {
    const input = motherInput.safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: "Invalid mother details.", details: input.error.flatten() });
    if (input.data.dueDate <= new Date()) return res.status(400).json({ error: "Due date must be in the future." });
    try {
      const mother = await Mother.create(input.data);
      await Visit.insertMany(calculateVisitDates(mother.dueDate).map((visit) => ({ ...visit, motherId: mother.id })));
      res.status(201).json(mother);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/mothers/:id", requireAuth, async (req, res, next) => {
    if (!isValidId(req.params.id)) return res.status(404).json({ error: "Mother not found." });
    try {
      const mother = await Mother.findById(req.params.id).lean();
      if (!mother || (req.auth.role === "mother" && String(mother.userId) !== req.auth.sub)) {
        return res.status(404).json({ error: "Mother not found." });
      }
      const visits = await Visit.find({ motherId: mother._id }).sort({ visitNo: 1 }).lean();
      res.json({ ...mother, visits: visits.map((visit) => serializedVisit(visit, new Date())) });
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/mothers/:id", requireAuth, requireRole("nurse"), async (req, res, next) => {
    if (!isValidId(req.params.id)) return res.status(404).json({ error: "Mother not found." });
    const input = motherInput.partial().safeParse(req.body);
    if (!input.success || Object.keys(input.data || {}).length === 0) {
      return res.status(400).json({ error: "Provide valid mother fields to update." });
    }
    if (input.data.dueDate && input.data.dueDate <= new Date()) return res.status(400).json({ error: "Due date must be in the future." });
    try {
      if (input.data.dueDate) {
        const existingVisits = await Visit.find({ motherId: req.params.id });
        if (existingVisits.some((visit) => visit.completedAt)) {
          return res.status(400).json({ error: "Due date cannot change after a visit is logged." });
        }
      }
      const mother = await Mother.findByIdAndUpdate(req.params.id, input.data, { new: true, runValidators: true });
      if (!mother) return res.status(404).json({ error: "Mother not found." });
      if (input.data.dueDate) {
        await Visit.deleteMany({ motherId: mother.id });
        await Visit.insertMany(calculateVisitDates(mother.dueDate).map((visit) => ({ ...visit, motherId: mother.id })));
      }
      res.json(mother);
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/mothers/:id", requireAuth, requireRole("nurse"), async (req, res, next) => {
    if (!isValidId(req.params.id)) return res.status(404).json({ error: "Mother not found." });
    try {
      const mother = await Mother.findByIdAndDelete(req.params.id);
      if (!mother) return res.status(404).json({ error: "Mother not found." });
      await Visit.deleteMany({ motherId: mother.id });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/visits", requireAuth, async (req, res, next) => {
    const page = paginated(req.query);
    if (!page) return res.status(400).json({ error: "Page must be positive and limit must be between 1 and 100." });
    try {
      let filter = {};
      if (req.auth.role === "mother") {
        const mother = await Mother.findOne({ userId: req.auth.sub }).select("_id").lean();
        if (!mother) return res.json({ data: [], pagination: { page: page.page, limit: page.limit, total: 0, pages: 0 } });
        filter.motherId = mother._id;
      } else if (req.query.motherId) {
        if (!isValidId(req.query.motherId)) return res.status(400).json({ error: "Invalid motherId." });
        filter.motherId = req.query.motherId;
      }
      const [visits, total] = await Promise.all([
        Visit.find(filter).sort({ visitDate: 1 }).skip((page.page - 1) * page.limit).limit(page.limit).lean(),
        Visit.countDocuments(filter)
      ]);
      res.json({
        data: visits.map((visit) => serializedVisit(visit, new Date())),
        pagination: { page: page.page, limit: page.limit, total, pages: Math.ceil(total / page.limit) }
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/visits", requireAuth, requireRole("nurse"), async (req, res, next) => {
    const input = z.object({ motherId: z.string(), visitNo: z.coerce.number().int().min(1).max(5) }).safeParse(req.body);
    if (!input.success || !isValidId(input.data?.motherId)) return res.status(400).json({ error: "A valid motherId and visitNo from 1 to 5 are required." });
    try {
      const mother = await Mother.findById(input.data.motherId);
      if (!mother) return res.status(404).json({ error: "Mother not found." });
      const visits = await Visit.find({ motherId: mother.id }).sort({ visitNo: 1 });
      const visit = visits.find((item) => item.visitNo === input.data.visitNo);
      if (!visit) return res.status(404).json({ error: "Scheduled visit not found." });
      if (visit.completedAt) return res.status(400).json({ error: "This visit has already been logged." });
      if (!canLogVisit(visit.visitNo, visits)) {
        return res.status(400).json({ error: `Log visit ${visit.visitNo - 1} before visit ${visit.visitNo}.` });
      }
      visit.completedAt = new Date();
      await visit.save();
      res.status(201).json(serializedVisit(visit, new Date()));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/analytics/missed-visits", requireAuth, requireRole("nurse"), async (_req, res, next) => {
    try {
      const now = new Date();
      const missed = await Visit.find({ visitDate: { $lt: startOfUtcDay(now) }, completedAt: null }).populate("motherId", "name phone dueDate").lean();
      const grouped = new Map();
      for (const visit of missed) {
        const mother = visit.motherId;
        if (!mother) continue;
        if (!grouped.has(String(mother._id))) grouped.set(String(mother._id), { mother, missedVisits: [] });
        grouped.get(String(mother._id)).missedVisits.push(serializedVisit(visit, now));
      }
      res.json({ data: Array.from(grouped.values()) });
    } catch (error) {
      next(error);
    }
  });

  app.use((_req, res) => res.status(404).json({ error: "Resource not found." }));
  app.use((error, _req, res, _next) => {
    if (error?.code === 11000) return res.status(400).json({ error: "A record with these details already exists." });
    if (error instanceof SyntaxError && "body" in error) return res.status(400).json({ error: "Request body must be valid JSON." });
    console.error(error);
    res.status(500).json({ error: "An unexpected server error occurred." });
  });

  return app;
}
