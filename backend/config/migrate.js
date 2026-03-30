// backend/config/migrate.js
// Run this ONCE: node backend/config/migrate.js
// Renames Pediatrics → General Physician everywhere in DB

const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const db = mongoose.connection.db;

    // ── 1. Rename department in users collection ────────────
    const usersResult = await db.collection("users").updateMany(
      { department: "Pediatrics" },
      { $set: { department: "General Physician" } }
    );
    console.log(`✅ Users updated: ${usersResult.modifiedCount} records`);

    // ── 2. Rename department in patients collection ─────────
    const patientsResult = await db.collection("patients").updateMany(
      { department: "Pediatrics" },
      { $set: { department: "General Physician" } }
    );
    console.log(`✅ Patients updated: ${patientsResult.modifiedCount} records`);

    // ── 3. Rename department in visits collection ───────────
    const visitsResult = await db.collection("visits").updateMany(
      { department: "Pediatrics" },
      { $set: { department: "General Physician" } }
    );
    console.log(`✅ Visits updated: ${visitsResult.modifiedCount} records`);

    // ── 4. Rename department in bloodrequests collection ────
    const brResult = await db.collection("bloodrequests").updateMany(
      { department: "Pediatrics" },
      { $set: { department: "General Physician" } }
    );
    console.log(`✅ Blood Requests updated: ${brResult.modifiedCount} records`);

    // ── 5. Rename department in surgeries collection ────────
    const surgResult = await db.collection("surgeries").updateMany(
      { department: "Pediatrics" },
      { $set: { department: "General Physician" } }
    );
    console.log(`✅ Surgeries updated: ${surgResult.modifiedCount} records`);

    // ── 6. Rename doctor name (Dr. Priya) department ────────
    const priyaResult = await db.collection("users").updateOne(
      { email: "priya@lifecare.com" },
      { $set: { department: "General Physician" } }
    );
    console.log(`✅ Dr. Priya department updated`);

    // ── 7. Update appointments collection ──────────────────
    try {
      const apptResult = await db.collection("appointments").updateMany(
        { department: "Pediatrics" },
        { $set: { department: "General Physician" } }
      );
      console.log(`✅ Appointments updated: ${apptResult.modifiedCount} records`);
    } catch (e) { console.log("ℹ️  Appointments collection not found, skipping"); }

    // ── 8. Update patient statuses to new format ────────────
    // Map old DISCHARGED to Discharged
    const statusMap = {
      "DISCHARGED": "Discharged",
    };
    for (const [oldStatus, newStatus] of Object.entries(statusMap)) {
      const r = await db.collection("patients").updateMany(
        { status: oldStatus },
        { $set: { status: newStatus } }
      );
      console.log(`✅ Patient status ${oldStatus}→${newStatus}: ${r.modifiedCount}`);
    }

    // ── 9. Add visitDate to existing visits ─────────────────
    const visitsAll = await db.collection("visits").find({ visitDate: { $exists: false } }).toArray();
    for (const v of visitsAll) {
      const d = new Date(v.createdAt);
      const vd = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      await db.collection("visits").updateOne({ _id: v._id }, { $set: { visitDate: vd } });
    }
    console.log(`✅ visitDate added to ${visitsAll.length} visits`);

    // ── 10. Add vitalsCompleted field to visits ──────────────
    const vcResult = await db.collection("visits").updateMany(
      { vitalsCompleted: { $exists: false } },
      { $set: { vitalsCompleted: false } }
    );
    console.log(`✅ vitalsCompleted field added: ${vcResult.modifiedCount} visits`);

    // ── 11. Fix blood request statuses in visits ─────────────
    // Old "PENDING" → "Requested By Doctor"
    const visitsWithBR = await db.collection("visits").find({
      "bloodRequests.status": "PENDING"
    }).toArray();
    for (const v of visitsWithBR) {
      const updatedBRs = v.bloodRequests.map(br => ({
        ...br,
        status: br.status === "PENDING" ? "Requested By Doctor" : br.status,
      }));
      await db.collection("visits").updateOne(
        { _id: v._id },
        { $set: { bloodRequests: updatedBRs } }
      );
    }
    console.log(`✅ Blood request statuses migrated in ${visitsWithBR.length} visits`);

    console.log("\n🎉 Migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration error:", err);
    process.exit(1);
  }
}

migrate();