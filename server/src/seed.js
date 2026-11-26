import "./env.js";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { User, Mother, Visit } from "./models.js";
import { calculateVisitDates } from "./schedule.js";

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI must be set in the environment.");
await mongoose.connect(process.env.MONGODB_URI);
const dueDate = new Date();
dueDate.setUTCMonth(dueDate.getUTCMonth() + 8);

const names = ["Amina Yusuf", "Grace Mensah", "Fatima Bello", "Mary Okafor", "Zainab Ali", "Ada Nwosu", "Esther Boateng", "Lydia James", "Hannah Musa", "Joy Eze"];
const sampleMothers = await Mother.find({ isSample: true }).select("_id").lean();
await Visit.deleteMany({ motherId: { $in: sampleMothers.map((mother) => mother._id) } });
await Mother.deleteMany({ isSample: true });
const mothers = await Mother.insertMany(names.map((name, index) => ({
  name,
  dueDate: new Date(dueDate.getTime() + index * 86400000),
  phone: `+1555000${String(index + 1).padStart(4, "0")}`,
  isSample: true
})));
await Visit.insertMany(mothers.flatMap((mother) => calculateVisitDates(mother.dueDate).map((visit) => ({ ...visit, motherId: mother._id }))));

if (process.env.NURSE_EMAIL && process.env.NURSE_PASSWORD) {
  const nurseFields = {
    name: process.env.NURSE_NAME || "Clinic Nurse",
    email: process.env.NURSE_EMAIL.toLowerCase(),
    passwordHash: await bcrypt.hash(process.env.NURSE_PASSWORD, 12),
    role: "nurse",
    isActive: true
  };
  if (process.env.NURSE_PHONE) {
    if (!/^\+[1-9]\d{7,14}$/.test(process.env.NURSE_PHONE)) {
      throw new Error("NURSE_PHONE must use international format, starting with + and the country code.");
    }
    nurseFields.phone = process.env.NURSE_PHONE;
  }
  await User.updateOne(
    { email: process.env.NURSE_EMAIL.toLowerCase() },
    { $set: nurseFields },
    { upsert: true }
  );
}
console.log(`Seeded ${mothers.length} mothers and ${mothers.length * 5} scheduled visits.`);
await mongoose.disconnect();
