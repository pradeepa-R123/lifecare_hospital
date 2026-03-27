// FILE: backend/routes/patients.js
const router  = require("express").Router();
const Patient = require("../models/Patient");
const User    = require("../models/User");
const Visit   = require("../models/Visit");
const { protect } = require("../middleware/auth");

// PRIORITY ORDER FOR DISPLAY
const STATUS_PRIORITY = {
  "Waiting": 0,
  "Surgery Scheduled": 1,
  "Admitted": 2,
  "DISCHARGED": 3,
};

// ------------------------------------------------------------------------
// GET /api/patients — LIST PATIENTS (with counts + filters + pagination)
// ------------------------------------------------------------------------
router.get("/", protect, async (req, res) => {
  try {
    const filter = {};

    // Filters
    if (req.query.department) filter.department = req.query.department;
    if (req.query.doctorName) filter.doctorName = req.query.doctorName;

    // Today's registrations filter
    if (req.query.today === "true") {
      const s = new Date(); s.setHours(0, 0, 0, 0);
      const e = new Date(); e.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: s, $lte: e };
    }

    // Search filter
    if (req.query.search && req.query.search.trim() !== "") {
      const q = req.query.search.trim();
      filter.$or = [
        { name:       { $regex: q, $options: "i" } },
        { patientId:  { $regex: q, $options: "i" } },
        { department: { $regex: q, $options: "i" } },
        { doctorName: { $regex: q, $options: "i" } },
        { bloodGroup: { $regex: q, $options: "i" } },
        { status:     { $regex: q, $options: "i" } },
        { gender:     { $regex: q, $options: "i" } },
        { symptoms:   { $regex: q, $options: "i" } },
        { phone:      { $regex: q, $options: "i" } },
        ...(!isNaN(q) ? [{ age: Number(q) }] : []),
      ];
    }

    // Status filter
    const validStatuses = [
      "Waiting",
      "Admitted",
      "Surgery Scheduled",
      "DISCHARGED"
    ];

    if (req.query.status && validStatuses.includes(req.query.status)) {
      filter.status = req.query.status;
    }

    // Pagination
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 10;
    const skip  = (page - 1) * limit;

    // Counts (ALL statuses)
    const [
      waitingCount,
      admittedCount,
      surgeryCount,
      dischargedCount
    ] = await Promise.all([
      Patient.countDocuments({ status: "Waiting" }),
      Patient.countDocuments({ status: "Admitted" }),
      Patient.countDocuments({ status: "Surgery Scheduled" }),
      Patient.countDocuments({ status: "DISCHARGED" }),
    ]);

    // Patient list fetch
    const patients = await Patient.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Sort by priority
    patients.sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status] ?? 99;
      const pb = STATUS_PRIORITY[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    // Response
    res.json({
      data: patients,
      pagination: {
        page,
        totalPages: Math.ceil(await Patient.countDocuments(filter) / limit),
        pageSize: limit,
      },
      counts: {
        waiting: waitingCount,
        admitted: admittedCount,
        surgery: surgeryCount,
        discharged: dischargedCount,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ------------------------------------------------------------------------
// GET /api/patients/search — returning patient search
// ------------------------------------------------------------------------
router.get("/search", protect, async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json([]);

    const patients = await Patient.find({
      $or: [
        { name:      { $regex: q, $options: "i" } },
        { patientId: { $regex: q, $options: "i" } },
        { phone:     { $regex: q, $options: "i" } },
      ],
    }).limit(10);

    res.json(patients);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ------------------------------------------------------------------------
// GET /api/patients/:id/visits — visit history for returning patient
// ------------------------------------------------------------------------
router.get("/:id/visits", protect, async (req, res) => {
  try {
    const visits = await Visit.find({ patientId: req.params.id })
      .sort({ createdAt: -1 });
    res.json(visits);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ------------------------------------------------------------------------
// POST /api/patients — register new patient + auto create visit
// ------------------------------------------------------------------------
router.post("/", protect, async (req, res) => {
  try {
    const { name, age, gender, phone, bloodGroup, symptoms, department, doctorName } = req.body;

    if (!name || !age || !gender || !bloodGroup || !symptoms || !department || !doctorName)
      return res.status(400).json({ message: "All fields are required" });

    if (!phone || phone.trim() === "")
      return res.status(400).json({ message: "Phone number is required" });

    // Find doctor
    const doctor = await User.findOne({ name: doctorName, role: "Doctor" });

    // Create patient
    const patient = await Patient.create({
      name,
      age,
      gender,
      phone,
      bloodGroup,
      symptoms,
      department,
      doctorName,
      doctorId: doctor?._id,
      registeredBy: req.user.id,
    });

    // Create first visit
    const visit = await Visit.create({
      patientId: patient._id,
      patientRef: patient.patientId,
      doctorId: doctor?._id,
      doctorName,
      department,
      complaints: symptoms,
      status: "WAITING",
      registeredBy: req.user.id,
    });

    res.status(201).json({ patient, visit });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ------------------------------------------------------------------------
// PUT /api/patients/:id — update status or fields
// ------------------------------------------------------------------------
router.put("/:id", protect, async (req, res) => {
  try {
    const validStatuses = [
      "Waiting",
      "Admitted",
      "Surgery Scheduled",
      "DISCHARGED",
    ];

    if (req.body.status && !validStatuses.includes(req.body.status)) {
      return res.status(400).json({
        message: `Invalid status "${req.body.status}". Allowed: ${validStatuses.join(", ")}`,
      });
    }

    const patient = await Patient.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });

    if (!patient) return res.status(404).json({ message: "Patient not found" });

    res.json(patient);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;