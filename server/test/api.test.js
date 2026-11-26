import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../src/app.js";
import { issueToken } from "../src/auth.js";
import { Mother, SystemSetting, User, Visit } from "../src/models.js";
import { calculateVisitDates, isMissed } from "../src/schedule.js";

process.env.JWT_SECRET = "test-secret-for-maternal-health";
const testNurseRegistrationCode = "test-nurse-registration-code";
let mongo;
let app;
let adminToken;
let nurseToken;
let motherToken;
let mother;

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Mother.deleteMany({}), Visit.deleteMany({}), SystemSetting.deleteMany({})]);
  const admin = await User.create({ name: "Test Admin", email: "admin@test.local", passwordHash: "hash", role: "admin" });
  const nurse = await User.create({ name: "Test Nurse", email: "nurse@test.local", passwordHash: "hash", role: "nurse" });
  const account = await User.create({ name: "Test Mother", email: "mother@test.local", passwordHash: "hash", role: "mother" });
  adminToken = issueToken(admin);
  nurseToken = issueToken(nurse);
  motherToken = issueToken(account);
  await SystemSetting.create({
    key: "system",
    nurseRegistrationCodeHash: await bcrypt.hash(testNurseRegistrationCode, 4)
  });
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
    nurseRegistrationCode: testNurseRegistrationCode
  });
  assert.equal(response.status, 201);
  assert.equal(response.body.user.role, "nurse");
  assert.ok(await User.exists({ email: "registered-nurse@test.local", role: "nurse", phone: "+15551234567" }));
  assert.equal(await Mother.countDocuments(), 1);
});

test("only administrators can replace the nurse invite code and the previous code stops working", async () => {
  const denied = await request(app).put("/api/admin/settings/nurse-registration-code")
    .set("Authorization", `Bearer ${nurseToken}`)
    .send({ nurseRegistrationCode: "replacement-nurse-code" });
  assert.equal(denied.status, 403);

  const saved = await request(app).put("/api/admin/settings/nurse-registration-code")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ nurseRegistrationCode: "replacement-nurse-code" });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.nurseRegistrationCodeConfigured, true);

  const oldCode = await request(app).post("/api/auth/register").send({
    role: "nurse",
    name: "Old Code Nurse",
    email: "old-code@test.local",
    password: "password123",
    phone: "+15551234567",
    nurseRegistrationCode: testNurseRegistrationCode
  });
  assert.equal(oldCode.status, 403);

  const newCode = await request(app).post("/api/auth/register").send({
    role: "nurse",
    name: "New Code Nurse",
    email: "new-code@test.local",
    password: "password123",
    phone: "+15551234567",
    nurseRegistrationCode: "replacement-nurse-code"
  });
  assert.equal(newCode.status, 201);
});

test("administrator can register a mother account and create its care schedule", async () => {
  const dueDate = new Date(Date.now() + 260 * 86400000);
  const response = await request(app).post("/api/admin/users")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      role: "mother",
      name: "Admin Registered Mother",
      email: "admin-mother@test.local",
      password: "password123",
      phone: "+15551234567",
      dueDate: dueDate.toISOString()
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.user.role, "mother");
  const user = await User.findById(response.body.user.id);
  const carePlan = await Mother.findOne({ userId: user.id });
  assert.ok(carePlan);
  assert.equal(await Visit.countDocuments({ motherId: carePlan.id }), 5);
});

test("administrator role and activation changes revoke sessions immediately", async () => {
  const created = await request(app).post("/api/admin/users")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      role: "nurse",
      name: "Managed Nurse",
      email: "managed-nurse@test.local",
      password: "password123",
      phone: "+15551234567"
    });
  assert.equal(created.status, 201);
  const user = await User.findById(created.body.user.id);
  const userToken = issueToken(user);

  const promoted = await request(app).patch(`/api/admin/users/${user.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ role: "admin" });
  assert.equal(promoted.status, 200);
  assert.equal(promoted.body.user.role, "admin");
  const oldRoleSession = await request(app).get("/api/mothers")
    .set("Authorization", `Bearer ${userToken}`);
  assert.equal(oldRoleSession.status, 401);

  const activeToken = issueToken(await User.findById(user.id));
  const deactivated = await request(app).patch(`/api/admin/users/${user.id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ isActive: false });
  assert.equal(deactivated.status, 200);
  assert.equal(deactivated.body.user.isActive, false);

  const inactiveSession = await request(app).get("/api/mothers")
    .set("Authorization", `Bearer ${activeToken}`);
  assert.equal(inactiveSession.status, 401);

  const login = await request(app).post("/api/auth/login")
    .send({ email: "managed-nurse@test.local", password: "password123" });
  assert.equal(login.status, 403);
});

test("administrator endpoints are restricted and admins cannot change their own role", async () => {
  const anonymous = await request(app).get("/api/admin/overview");
  assert.equal(anonymous.status, 401);

  const nurseDenied = await request(app).get("/api/admin/overview")
    .set("Authorization", `Bearer ${nurseToken}`);
  assert.equal(nurseDenied.status, 403);

  const motherDenied = await request(app).get("/api/admin/users")
    .set("Authorization", `Bearer ${motherToken}`);
  assert.equal(motherDenied.status, 403);

  const publicAdminRegistration = await request(app).post("/api/auth/register").send({
    role: "admin",
    name: "Unapproved Admin",
    email: "unapproved-admin@test.local",
    password: "password123",
    phone: "+15551234567"
  });
  assert.equal(publicAdminRegistration.status, 400);
  assert.equal(await User.exists({ email: "unapproved-admin@test.local" }), null);

  const selfDemotion = await request(app).patch(`/api/admin/users/${(await User.findOne({ role: "admin" })).id}`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ role: "nurse" });
  assert.equal(selfDemotion.status, 400);

  const overview = await request(app).get("/api/admin/overview")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(overview.status, 200);
  assert.equal(overview.body.summary.adminAccounts, 1);
  assert.equal(overview.body.summary.nurseAccounts, 1);
  assert.equal(overview.body.summary.motherAccounts, 1);
});

test("administrator reports monitor real missed visits and exclude sample records", async () => {
  const actualMissedVisit = await Visit.findOne({ motherId: mother.id, visitNo: 1 });
  actualMissedVisit.visitDate = new Date(Date.now() - 86400000);
  await actualMissedVisit.save();
  const sampleMother = await Mother.create({
    name: "Sample Mother",
    phone: "+15557654321",
    dueDate: new Date(Date.now() + 250 * 86400000),
    isSample: true
  });
  await Visit.create({ motherId: sampleMother.id, visitNo: 1, visitDate: new Date(Date.now() - 86400000) });

  const overview = await request(app).get("/api/admin/overview")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(overview.body.summary.missedVisits, 1);

  const missed = await request(app).get("/api/admin/missed-visits?page=1&limit=10")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(missed.status, 200);
  assert.equal(missed.body.pagination.total, 1);
  assert.equal(missed.body.data[0].motherId.name, mother.name);

  const mothersList = await request(app).get("/api/admin/mothers?page=1&limit=10")
    .set("Authorization", `Bearer ${adminToken}`);
  assert.equal(mothersList.body.pagination.total, 1);
  assert.notEqual(mothersList.body.data[0].name, "Sample Mother");
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
