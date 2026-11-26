import "./env.js";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { User } from "./models.js";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME?.trim() || "System Administrator";
if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI must be set in the environment.");
if (!email || !password) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD to provision the system administrator.");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("ADMIN_EMAIL must be a valid email address.");
if (password.length < 8 || password.length > 100) throw new Error("ADMIN_PASSWORD must contain between 8 and 100 characters.");
if (name.length < 2 || name.length > 100) throw new Error("ADMIN_NAME must contain between 2 and 100 characters.");
if (email === process.env.NURSE_EMAIL?.trim().toLowerCase()) {
  throw new Error("ADMIN_EMAIL and NURSE_EMAIL must be different.");
}
if (process.env.ADMIN_PHONE && !/^\+[1-9]\d{7,14}$/.test(process.env.ADMIN_PHONE)) {
  throw new Error("ADMIN_PHONE must use international format, starting with + and the country code.");
}

await mongoose.connect(process.env.MONGODB_URI);
try {
  const adminFields = {
    name,
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: "admin",
    isActive: true
  };
  if (process.env.ADMIN_PHONE) adminFields.phone = process.env.ADMIN_PHONE;
  await User.updateOne({ email }, { $set: adminFields }, { upsert: true });
  console.log("System administrator account provisioned.");
} finally {
  await mongoose.disconnect();
}
