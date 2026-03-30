// FILE: backend/routes/patients.js
// KEY CHANGE: GET /api/patients/:id/visits — used by receptionist
// The  patient logic (active visit block) is enforced in Visits.js POST
// But we also add a helper endpoint to check active visits

const router  = require("express").Router();
const Patient = require("../models/Patient");
const User    = require("../models/User");
const Visit   = require("../models/Visit");
const { protect } = require("../middleware/auth");

// ✅ UPDATED: Added "Completed" to STATUS_PRIORITY
const STATUS_PRIORITY = {
  "Waiting": 0, "Surgery Scheduled": 1, "Admitted": 2, "Completed": 3, "Discharged": 4,
};

// GET /api/patients
router.get("/", protect, async (req, res) => {
  try {
    const filter = {};
    if (req.query.department) filter.department = req.query.department;
    if (req.query.doctorName) filter.doctorName = req.query.doctorName;
    if (req.query.today === "true") {
      const s = new Date(); s.setHours(0,0,0,0);
      const e = new Date(); e.setHours(23,59,59,999);
      filter.createdAt = { $gte: s, $lte: e };
    }
    if (req.query.search && req.query.search.trim() !== "") {
      const q = req.query.search.trim();
      filter.$or = [
        { name:       { $regex: q, $options:"i" } },
        { patientId:  { $regex: q, $options:"i" } },
        { department: { $regex: q, $options:"i" } },
        { doctorName: { $regex: q, $options:"i" } },
        { bloodGroup: { $regex: q, $options:"i" } },
        { status:     { $regex: q, $options:"i" } },
        { gender:     { $regex: q, $options:"i" } },
        { symptoms:   { $regex: q, $options:"i" } },
        { phone:      { $regex: q, $options:"i" } },
        ...(!isNaN(q) ? [{ age: Number(q) }] : []),
      ];
    }

    // ✅ UPDATED: Added "Completed" to validStatuses
    const validStatuses = ["Waiting", "Admitted", "Surgery Scheduled", "Discharged", "Completed"];
    if (req.query.status && validStatuses.includes(req.query.status)) {
      filter.status = req.query.status;
    }

    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 10;
    const skip  = (page - 1) * limit;

    // ✅ UPDATED: Added completedCount
    const [waitingCount, admittedCount, surgeryCount, dischargedCount, completedCount] =
      await Promise.all([
        Patient.countDocuments({ status: "Waiting" }),
        Patient.countDocuments({ status: "Admitted" }),
        Patient.countDocuments({ status: "Surgery Scheduled" }),
        Patient.countDocuments({ status: "Discharged" }),
        Patient.countDocuments({ status: "Completed" }),   // ✅ NEW
      ]);

    const patients = await Patient.find(filter)
      .sort({ createdAt: -1 }).skip(skip).limit(limit);

    patients.sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status] ?? 99;
      const pb = STATUS_PRIORITY[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const totalCount = await Patient.countDocuments(filter);
    res.json({
      data: patients,
      pagination: {
        page,
        totalPages: Math.ceil(totalCount / limit),
        pageSize: limit,
      },
      // ✅ UPDATED: Added completed to counts
      counts: {
        waiting:    waitingCount,
        admitted:   admittedCount,
        surgery:    surgeryCount,
        discharged: dischargedCount,
        completed:  completedCount,   // ✅ NEW
      },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/patients/search
router.get("/search", protect, async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json([]);
    const patients = await Patient.find({
      $or: [
        { name:      { $regex: q, $options:"i" } },
        { patientId: { $regex: q, $options:"i" } },
        { phone:     { $regex: q, $options:"i" } },
      ],
    }).limit(10);
    res.json(patients);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/patients/:id/visits
// Returns ALL visits for this patient (for timeline history)
router.get("/:id/visits", protect, async (req, res) => {
  try {
    const visits = await Visit.find({ patientId: req.params.id })
      .sort({ createdAt: -1 });
    res.json(visits);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/patients/:id
router.get("/:id", protect, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ message: "Patient not found" });
    res.json(patient);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/patients — register new patient + auto create visit
router.post("/", protect, async (req, res) => {
  try {
    const { name, age, gender, phone, bloodGroup, symptoms, department, doctorName } = req.body;
    if (!name || !age || !gender || !bloodGroup || !symptoms || !department || !doctorName)
      return res.status(400).json({ message: "All fields are required" });
    if (!phone || phone.trim() === "")
      return res.status(400).json({ message: "Phone number is required" });

    const doctor = await User.findOne({ name: doctorName, role: "Doctor" });
    const patient = await Patient.create({
      name, age, gender, phone, bloodGroup, symptoms,
      department, doctorName,
      doctorId:     doctor?._id,
      registeredBy: req.user.id,
    });

    const visit = await Visit.create({
      patientId:    patient._id,
      patientRef:   patient.patientId,
      doctorId:     doctor?._id,
      doctorName,
      department,
      complaints:   symptoms,
      status:       "WAITING",
      registeredBy: req.user.id,
    });

    res.status(201).json({ patient, visit });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/patients/:id
router.put("/:id", protect, async (req, res) => {
  try {
    // ✅ UPDATED: Added "Completed" to validStatuses
    const validStatuses = ["Waiting", "Admitted", "Surgery Scheduled", "Discharged", "Completed"];
    if (req.body.status && !validStatuses.includes(req.body.status)) {
      return res.status(400).json({
        message: `Invalid status "${req.body.status}". Allowed: ${validStatuses.join(", ")}`,
      });
    }
    const patient = await Patient.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!patient) return res.status(404).json({ message: "Patient not found" });
    res.json(patient);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;