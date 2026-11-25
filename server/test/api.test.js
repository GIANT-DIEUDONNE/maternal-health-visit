import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../src/app.js";
import { issueToken } from "../src/auth.js";
import { Mother, User, Visit } from "../src/models.js";
import { calculateVisitDates, isMissed } from "../src/schedule.js";

process.env.JWT_SECRET = "test-secret-for-maternal-health";
process.env.NURSE_REGISTRATION_CODE = "test-nurse-registration-code";
let mongo;
let app;
let nurseToken;
let motherToken;
let mother;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Mother.deleteMany({}), Visit.deleteMany({})]);
  const nurse = await User.create({ name: "Test Nurse", email: "nurse@test.local", passwordHash: "hash", role: "nurse" });
  const account = await User.create({ name: "Test Mother", email: "mother@test.local", passwordHash: "hash", role: "mother" });
  nurseToken = issueToken(nurse);
  motherToken = issueToken(account);
  const dueDate = new Date(Date.now() + 250 * 86400000);
  mother = await Mother.create({ name: account.name, phone: "5551234567", dueDate, userId: account.id });
  await Visit.insertMany(calculateVisitDates(dueDate).map((visit) => ({ ...visit, motherId: mother.id })));
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test("mother registration saves the mother role and creates her care plan", async () => {
  const dueDate = new Date(Date.now() + 260 * 86400000);
  const response = await request(app).post("/api/auth/register").send({
    role: "mother",
    name: "Registered Mother",
    email: "registered-mother@test.local",
    password: "password123",
    phone: "+15551234567",
    dueDate: dueDate.toISOString()
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.user.role, "mother");
  const user = await User.findById(response.body.user.id);
  assert.equal(user.phone, "+15551234567");
  const carePlan = await Mother.findOne({ userId: user.id });
  assert.ok(carePlan);
  assert.equal(await Visit.countDocuments({ motherId: carePlan.id }), 5);
});

test("nurse registration requires the configured invite code and saves the nurse role", async () => {
  const denied = await request(app).post("/api/auth/register").send({
    role: "nurse",
    name: "Uninvited Nurse",
    email: "uninvited@test.local",
    password: "password123",
    phone: "+15551234567",
    nurseRegistrationCode: "wrong-code"
  });
  assert.equal(denied.status, 403);
  assert.equal(await User.exists({ email: "uninvited@test.local" }), null);

  const response = await request(app).post("/api/auth/register").send({
    role: "nurse",
    name: "Registered Nurse",
    email: "registered-nurse@test.local",
    password: "password123",
    phone: "+15551234567",
    nurseRegistrationCode: process.env.NURSE_REGISTRATION_CODE
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.user.role, "nurse");
  assert.ok(await User.exists({ email: "registered-nurse@test.local", role: "nurse", phone: "+15551234567" }));
  assert.equal(await Mother.countDocuments(), 1);
});

test("nurse can successfully log the first scheduled visit", async () => {
  const response = await request(app).post("/api/visits").set("Authorization", `Bearer ${nurseToken}`)
    .send({ motherId: mother.id, visitNo: 1 });
  assert.equal(response.status, 201);
  assert.equal(response.body.visitNo, 1);
  assert.ok(response.body.completedAt);
  assert.equal(response.body.missed, false);
});

test("mother can view her visit history and clinical notes", async () => {
  const visit = await Visit.findOne({ motherId: mother.id, visitNo: 1 });
  visit.completedAt = new Date();
  visit.notes = "Initial antenatal check completed.";
  await visit.save();

  const response = await request(app).get(`/api/mothers/${mother.id}`)
    .set("Authorization", `Bearer ${motherToken}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.visits.length, 5);
  assert.equal(response.body.visits[0].notes, "Initial antenatal check completed.");
  assert.ok(response.body.visits[0].completedAt);
});

test("nurse can add notes to completed visits, but mothers cannot edit them", async () => {
  const visit = await Visit.findOne({ motherId: mother.id, visitNo: 1 });
  visit.completedAt = new Date();
  await visit.save();

  const saved = await request(app).patch(`/api/visits/${visit.id}`)
    .set("Authorization", `Bearer ${nurseToken}`)
    .send({ notes: "Follow-up plan discussed." });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.notes, "Follow-up plan discussed.");

  const denied = await request(app).patch(`/api/visits/${visit.id}`)
    .set("Authorization", `Bearer ${motherToken}`)
    .send({ notes: "Changed by mother." });
  assert.equal(denied.status, 403);
  assert.equal((await Visit.findById(visit.id)).notes, "Follow-up plan discussed.");
});

test("clinical notes require a completed visit and enforce a length limit", async () => {
  const visit = await Visit.findOne({ motherId: mother.id, visitNo: 1 });

  const uncompleted = await request(app).patch(`/api/visits/${visit.id}`)
    .set("Authorization", `Bearer ${nurseToken}`)
    .send({ notes: "Not yet completed." });
  assert.equal(uncompleted.status, 400);

  const tooLong = await request(app).patch(`/api/visits/${visit.id}`)
    .set("Authorization", `Bearer ${nurseToken}`)
    .send({ notes: "x".repeat(2001) });
  assert.equal(tooLong.status, 400);
});

test("nurse-created mother receives five due-date-based visits", async () => {
  const dueDate = new Date(Date.now() + 260 * 86400000);
  const response = await request(app).post("/api/mothers").set("Authorization", `Bearer ${nurseToken}`)
    .send({ name: "New Mother", phone: "5559876543", dueDate: dueDate.toISOString() });
  assert.equal(response.status, 201);
  const visits = await Visit.find({ motherId: response.body._id }).sort({ visitNo: 1 }).lean();
  assert.equal(visits.length, 5);
  assert.deepEqual(visits.map((visit) => visit.visitNo), [1, 2, 3, 4, 5]);
  assert.deepEqual(
    visits.map((visit) => new Date(visit.visitDate).toISOString()),
    calculateVisitDates(dueDate).map((visit) => visit.visitDate.toISOString())
  );
});

test("invalid visit input returns 400", async () => {
  const response = await request(app).post("/api/visits").set("Authorization", `Bearer ${nurseToken}`)
    .send({ motherId: "not-an-id", visitNo: 0 });
  assert.equal(response.status, 400);
});

test("mother role cannot create a nurse-only mother record", async () => {
  const response = await request(app).post("/api/mothers").set("Authorization", `Bearer ${motherToken}`)
    .send({ name: "Another Mother", dueDate: new Date(Date.now() + 200 * 86400000), phone: "5551234567" });
  assert.equal(response.status, 403);
});

test("out-of-order visit logging returns a clear 400 message", async () => {
  const response = await request(app).post("/api/visits").set("Authorization", `Bearer ${nurseToken}`)
    .send({ motherId: mother.id, visitNo: 5 });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Log visit 4 before visit 5/);
});

test("unknown mother record returns 404", async () => {
  const response = await request(app).get(`/api/mothers/${new mongoose.Types.ObjectId()}`)
    .set("Authorization", `Bearer ${nurseToken}`);
  assert.equal(response.status, 404);
});

test("today's uncompleted visit is not flagged as missed", () => {
  const today = new Date();
  const visitDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  assert.equal(isMissed({ visitDate, completedAt: null }, today), false);
  visitDate.setUTCDate(visitDate.getUTCDate() - 1);
  assert.equal(isMissed({ visitDate, completedAt: null }, today), true);
});
