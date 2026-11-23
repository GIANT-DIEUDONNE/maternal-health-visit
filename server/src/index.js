import "./env.js";
import mongoose from "mongoose";
import { createApp } from "./app.js";

if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET must be set in the environment.");
if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI must be set in the environment.");

await mongoose.connect(process.env.MONGODB_URI);
console.log("MongoDB connected successfully.");
const port = Number(process.env.PORT || 4000);
createApp().listen(port, () => console.log(`Maternal health API listening on http://localhost:${port}`));
