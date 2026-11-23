import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["nurse", "mother"], required: true }
  },
  { timestamps: true }
);

const motherSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    dueDate: { type: Date, required: true },
    phone: { type: String, required: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    isSample: { type: Boolean, default: false, select: false }
  },
  { timestamps: true }
);

const visitSchema = new mongoose.Schema(
  {
    motherId: { type: mongoose.Schema.Types.ObjectId, ref: "Mother", required: true, index: true },
    visitNo: { type: Number, required: true, min: 1, max: 5 },
    visitDate: { type: Date, required: true },
    completedAt: { type: Date, default: null }
  },
  { timestamps: true }
);
visitSchema.index({ motherId: 1, visitNo: 1 }, { unique: true });

export const User = mongoose.models.User || mongoose.model("User", userSchema);
export const Mother = mongoose.models.Mother || mongoose.model("Mother", motherSchema);
export const Visit = mongoose.models.Visit || mongoose.model("Visit", visitSchema);
