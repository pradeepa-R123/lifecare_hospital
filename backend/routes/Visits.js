// FILE: backend/routes/Visits.js

const router  = require("express").Router();
const Visit   = require("../models/Visit");
const Patient = require("../models/Patient");
const User    = require("../models/User");
const { protect } = require("../middleware/auth");
const axios   = require("axios");

const BLOOD_BANK_URL = process.env.BLOOD_BANK_URL || "http://localhost:5002";

// ── Map Visit status → Patient.status ────────────────────────
function toPatientStatus(visitStatus) {
  switch (visitStatus) {
    case "ADMITTED":   return "Admitted";
    case "SURGERY":    return "Surgery Scheduled";
    case "DISCHARGED": return "DISCHARGED";
    default:           return "Waiting";   // WAITING, IN_CONSULTATION, COMPLETED
  }
}

module.exports = (broadcast) => {

  // ── GET /api/visits ──────────────────────────────────────
  router.get("/", protect, async (req, res) => {
    try {
      const filter = {};
      if (req.query.status)     filter.status     = req.query.status;
      if (req.query.department) filter.department = req.query.department;
      if (req.query.doctorName) filter.doctorName = req.query.doctorName;
      if (req.query.patientId)  filter.patientId  = req.query.patientId;
      if (req.query.statuses)   filter.status     = { $in: req.query.statuses.split(",") };
      if (req.query.today === "true") {
        const s = new Date(); s.setHours(0,0,0,0);
        const e = new Date(); e.setHours(23,59,59,999);
        filter.createdAt = { $gte: s, $lte: e };
      }
      const visits = await Visit.find(filter)
        .populate("patientId", "name age gender bloodGroup phone patientId")
        .sort({ createdAt: -1 });
      res.json(visits);
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // ── GET /api/visits/:id ──────────────────────────────────
  router.get("/:id", protect, async (req, res) => {
    try {
      const visit = await Visit.findById(req.params.id)
        .populate("patientId", "name age gender bloodGroup phone patientId");
      if (!visit) return res.status(404).json({ message: "Visit not found" });
      res.json(visit);
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // ── POST /api/visits — receptionist creates visit ────────
  router.post("/", protect, async (req, res) => {
    try {
      const { patientId, patientRef, doctorId, doctorName, department, complaints } = req.body;
      if (!patientId || !doctorName || !department)
        return res.status(400).json({ message: "patientId, doctorName, department required" });

      const visit = await Visit.create({
        patientId, patientRef: patientRef || "",
        doctorId, doctorName, department,
        complaints: complaints || "",
        status: "WAITING",
        registeredBy: req.user.id,
      });

      const populated = await Visit.findById(visit._id)
        .populate("patientId", "name age gender bloodGroup phone patientId");

      broadcast({ type: "NEW_VISIT", data: populated });
      res.status(201).json(populated);
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // ── PATCH /api/visits/:id/status — doctor changes status ─
  // FIX 1: Sync Patient.status whenever visit status changes
  router.patch("/:id/status", protect, async (req, res) => {
    try {
      const { status } = req.body;
      const allowed = ["WAITING","IN_CONSULTATION","COMPLETED","ADMITTED","SURGERY","DISCHARGED"];
      if (!allowed.includes(status))
        return res.status(400).json({ message: `Invalid status: ${status}` });

      const update = { status };
      if (status === "IN_CONSULTATION") update.startedAt    = new Date();
      if (status === "COMPLETED")       update.completedAt  = new Date();
      if (status === "DISCHARGED")      update.dischargedAt = new Date();

      const visit = await Visit.findByIdAndUpdate(req.params.id, update, { new: true })
        .populate("patientId", "name age gender bloodGroup phone patientId");
      if (!visit) return res.status(404).json({ message: "Visit not found" });

      // ── FIX 1: Update Patient.status to match visit status ──
      const patientId     = visit.patientId?._id || visit.patientId;
      const patientStatus = toPatientStatus(status);
      await Patient.findByIdAndUpdate(patientId, { status: patientStatus });
      // ────────────────────────────────────────────────────────

      broadcast({ type: "VISIT_STATUS_CHANGED", data: visit });
      res.json(visit);
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // ── PUT /api/visits/:id — doctor saves EMR ───────────────
  router.put("/:id", protect, async (req, res) => {
    try {
      const allowed = ["complaints","diagnosis","treatment","status","surgeryType","scheduledAt","surgeryNotes"];
      const update  = {};
      allowed.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });

      if (update.status === "IN_CONSULTATION") update.startedAt    = new Date();
      if (update.status === "COMPLETED")       update.completedAt  = new Date();
      if (update.status === "DISCHARGED")      update.dischargedAt = new Date();

      const visit = await Visit.findByIdAndUpdate(req.params.id, update, { new: true })
        .populate("patientId", "name age gender bloodGroup phone patientId");
      if (!visit) return res.status(404).json({ message: "Visit not found" });

      // ── FIX 1 (also sync if status changed via PUT) ──────────
      if (update.status) {
        const patientId     = visit.patientId?._id || visit.patientId;
        const patientStatus = toPatientStatus(update.status);
        await Patient.findByIdAndUpdate(patientId, { status: patientStatus });
      }
      // ────────────────────────────────────────────────────────

      broadcast({ type: "VISIT_UPDATED", data: visit });
      res.json(visit);
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // ── POST /api/visits/:id/vitals — nurse records vitals ───
  router.post("/:id/vitals", protect, async (req, res) => {
    try {
      const { bp, pulse, spo2, temperature, sugar, weight, notes } = req.body;
      const visit = await Visit.findByIdAndUpdate(
        req.params.id,
        { vitals: { bp: bp||"", pulse: pulse??null, spo2: spo2??null,
            temperature: temperature??null, sugar: sugar??null,
            weight: weight??null, notes: notes||"",
            recordedBy: req.user.id, recordedAt: new Date() } },
        { new: true }
      ).populate("patientId", "name age gender bloodGroup phone patientId");
      if (!visit) return res.status(404).json({ message: "Visit not found" });

      broadcast({ type: "VITALS_UPDATED", data: visit });
      res.json(visit);
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // ── POST /api/visits/:id/blood-requests — doctor adds blood request
  // FIX 2: Block if DISCHARGED/COMPLETED. FIX 3: Auto-use patient's blood group.
  router.post("/:id/blood-requests", protect, async (req, res) => {
    try {
      // Fetch visit with patient populated to get blood group
      const visit = await Visit.findById(req.params.id)
        .populate("patientId", "name age gender bloodGroup phone patientId");
      if (!visit) return res.status(404).json({ message: "Visit not found" });

      // ── FIX 2: Block blood requests for discharged/completed patients ──
      const blockedStatuses = ["DISCHARGED", "COMPLETED"];
      if (blockedStatuses.includes(visit.status)) {
        return res.status(400).json({
          message: `Blood requests cannot be added for ${visit.status} patients. Only Waiting, In Consultation, Admitted, or Surgery Scheduled patients are eligible.`,
        });
      }

      // ── FIX 3: Always use patient's own blood group (ignore request body bloodGroup) ──
      const patientBloodGroup = visit.patientId?.bloodGroup;
      if (!patientBloodGroup) {
        return res.status(400).json({ message: "Patient blood group not found in records." });
      }

      const { units, reason, priority } = req.body;
      if (!units) return res.status(400).json({ message: "units is required" });

      visit.bloodRequests = visit.bloodRequests || [];
      visit.bloodRequests.push({
        bloodGroup: patientBloodGroup,   // always from patient record
        units:      Number(units),
        reason:     reason   || "",
        priority:   priority || "Normal",
        status:     "PENDING",
      });
      await visit.save();

      const updated = await Visit.findById(visit._id)
        .populate("patientId", "name age gender bloodGroup phone patientId");

      broadcast({ type: "VISIT_UPDATED", data: updated });
      res.json(updated);
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // ── POST /api/visits/:id/blood-requests/:brId/send — nurse forwards to blood bank
  router.post("/:id/blood-requests/:brId/send", protect, async (req, res) => {
    try {
      const visit = await Visit.findById(req.params.id)
        .populate("patientId", "name age gender bloodGroup phone patientId");
      if (!visit) return res.status(404).json({ message: "Visit not found" });

      const br = visit.bloodRequests.id(req.params.brId);
      if (!br) return res.status(404).json({ message: "Blood request not found" });
      if (br.status !== "PENDING")
        return res.status(400).json({ message: "Only PENDING requests can be sent" });

      const patient = visit.patientId;
      let bbOk = false;
      let bbId  = "";

      try {
        const bbRes = await axios.post(`${BLOOD_BANK_URL}/api/blood-requests`, {
          patientId:         patient.patientId || "",
          visitId:           visit._id.toString(),
          doctorId:          visit.doctorId    || "",
          bloodGroup:        br.bloodGroup,
          units:             br.units,
          priority:          br.priority || "Normal",
          notes:             br.reason   || "",
          hospitalRequestId: br._id.toString(),
          patientName:       patient.name,
          hospitalName:      "HealthCare Hospital",
          department:        visit.department,
          requestedBy:       visit.doctorName,
        }, { timeout: 5000 });

        bbId  = bbRes.data?._id || "";
        bbOk  = true;
      } catch (bbErr) {
        console.warn("BloodBank unreachable:", bbErr.message);
      }

      br.status             = "SENT_TO_BLOODBANK";
      br.bloodBankRequestId = bbId;
      await visit.save();

      const updated = await Visit.findById(visit._id)
        .populate("patientId", "name age gender bloodGroup phone patientId");

      broadcast({ type: "BLOOD_REQUEST_SENT", data: updated });
      res.json({ visit: updated, bloodBankReached: bbOk });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  return router;
};