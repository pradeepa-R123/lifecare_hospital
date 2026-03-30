const router  = require("express").Router();
const Visit   = require("../models/Visit");
const Patient = require("../models/Patient");
const { protect } = require("../middleware/auth");
const axios   = require("axios");

const BLOOD_BANK_URL = process.env.BLOOD_BANK_URL || "http://localhost:5002";

// ── Map Visit status → Patient.status ────────────────────────
function toPatientStatus(visitStatus) {
  switch (visitStatus) {
    case "WAITING":          return "Waiting";
    case "VITALS_PENDING":   return "Waiting";
    case "VITALS_COMPLETED": return "Waiting";
    case "IN_CONSULTATION":  return "Waiting";
    case "COMPLETED":        return "Completed";
    case "ADMITTED":         return "Admitted";
    case "SURGERY":          return "Surgery Scheduled";
    case "DISCHARGED":       return "Discharged";
    default:                 return "Waiting";
  }
}

async function syncPatientStatus(visit) {
  try {
    const patientId = visit.patientId?._id || visit.patientId;
    if (!patientId) return;
    const newStatus = toPatientStatus(visit.status);
    await Patient.findByIdAndUpdate(patientId, { status: newStatus });
    console.log(`✅ Patient synced → ${newStatus}`);
  } catch (err) {
    console.error("❌ syncPatientStatus:", err.message);
  }
}

function todayDateStr() {
  const d  = new Date();
  const yr = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mm}-${dd}`;
}

// ── Safe visitId generator with retry loop ────────────────────
// Retries up to 10 times. First attempt uses count+1 (sequential),
// subsequent attempts append a timestamp+random suffix to guarantee
// uniqueness even under concurrent registrations.
async function generateVisitId() {
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 10; attempt++) {
    let candidateId;

    if (attempt === 0) {
      // Preferred: sequential V-YYYY-XXXX
      const count = await Visit.countDocuments();
      candidateId = `V-${year}-${String(count + 1).padStart(4, "0")}`;
    } else {
      // Fallback: timestamp (last 5 digits) + 2-digit random → effectively unique
      const ts   = Date.now().toString().slice(-5);
      const rand = String(Math.floor(Math.random() * 100)).padStart(2, "0");
      candidateId = `V-${year}-${ts}${rand}`;
    }

    const existing = await Visit.findOne({ visitId: candidateId }).lean();
    if (!existing) {
      console.log(`✅ visitId generated (attempt ${attempt + 1}): ${candidateId}`);
      return candidateId;
    }

    console.warn(`⚠ visitId collision on attempt ${attempt + 1}: ${candidateId} — retrying…`);
  }

  throw new Error("Could not generate a unique visitId after 10 attempts.");
}

module.exports = (broadcast) => {

  // ── GET /api/visits ────────────────────────────────────────
  router.get("/", protect, async (req, res) => {
    try {
      const filter = {};
      if (req.query.status)     filter.status     = req.query.status;
      if (req.query.department) filter.department = req.query.department;
      if (req.query.doctorName) filter.doctorName = req.query.doctorName;
      if (req.query.patientId)  filter.patientId  = req.query.patientId;
      if (req.query.statuses) {
        filter.status = { $in: req.query.statuses.split(",") };
      }
      if (req.query.today === "true") filter.visitDate = todayDateStr();
      if (req.query.date)             filter.visitDate = req.query.date;

      const visits = await Visit.find(filter)
        .populate("patientId", "name age gender bloodGroup phone patientId")
        .sort({ createdAt: -1 });

      res.json(visits);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── GET /api/visits/dates ──────────────────────────────────
  router.get("/dates", protect, async (req, res) => {
    try {
      const matchFilter = {};
      if (req.query.doctorName) matchFilter.doctorName = req.query.doctorName;
      if (req.query.department) matchFilter.department = req.query.department;
      const dates = await Visit.distinct("visitDate", matchFilter);
      res.json(dates.sort((a, b) => b.localeCompare(a)));
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── PATCH /api/visits/blood-request-status/:brId ──────────
  // Called BY Blood Bank to update visit-embedded blood request
  // MUST be before /:id routes
  router.patch("/blood-request-status/:brId", async (req, res) => {
    try {
      const { status, notes } = req.body;
      const allowed = ["Approved", "Rejected", "Fulfilled"];
      if (!allowed.includes(status)) {
        return res.status(400).json({ message: `Invalid status: ${status}` });
      }

      const visit = await Visit.findOne({
        "bloodRequests._id": req.params.brId,
      }).populate("patientId", "name age gender bloodGroup phone patientId");

      if (!visit) {
        return res.status(404).json({
          message: `No visit found containing blood request ${req.params.brId}`,
        });
      }

      const br = visit.bloodRequests.id(req.params.brId);
      if (!br) {
        return res.status(404).json({ message: "Blood request subdocument not found" });
      }

      br.status = status;
      if (status === "Fulfilled") br.fulfilledAt = new Date();
      if (notes) br.notes = notes;
      await visit.save();

      const updated = await Visit.findById(visit._id)
        .populate("patientId", "name age gender bloodGroup phone patientId");

      broadcast({ type: "BLOOD_REQUEST_STATUS_UPDATED", data: updated });
      console.log(`✅ Visit blood request ${req.params.brId} synced → ${status}`);
      res.json(updated);
    } catch (err) {
      console.error("❌ blood-request-status error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ── GET /api/visits/:id ────────────────────────────────────
  router.get("/:id", protect, async (req, res) => {
    try {
      const visit = await Visit.findById(req.params.id)
        .populate("patientId", "name age gender bloodGroup phone patientId");
      if (!visit) return res.status(404).json({ message: "Visit not found" });
      res.json(visit);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── POST /api/visits ───────────────────────────────────────
  router.post("/", protect, async (req, res) => {
    try {
      const { patientId, patientRef, doctorId, doctorName, department, complaints } = req.body;

      if (!patientId || !doctorName || !department) {
        return res.status(400).json({
          message: "patientId, doctorName, and department are required",
        });
      }

      // Block if patient already has an active visit (any date)
      const activeVisit = await Visit.findOne({
        patientId,
        status: {
          $in: ["WAITING", "VITALS_PENDING", "VITALS_COMPLETED", "IN_CONSULTATION", "ADMITTED", "SURGERY"],
        },
      });
      if (activeVisit) {
        return res.status(400).json({
          message: `Patient already has an active visit (${activeVisit.visitId} — ${activeVisit.status}). Discharge first.`,
        });
      }

      // ✅ Generate a guaranteed-unique visitId before creating the document
      const visitId = await generateVisitId();

      const visit = await Visit.create({
        visitId,           // ← explicitly set, bypasses any pre-save hook race condition
        patientId,
        patientRef:   patientRef || "",
        doctorId:     doctorId   || null,
        doctorName,
        department,
        complaints:   complaints || "",
        status:       "WAITING",
        registeredBy: req.user.id,
      });

      await syncPatientStatus(visit);

      const populated = await Visit.findById(visit._id)
        .populate("patientId", "name age gender bloodGroup phone patientId");

      broadcast({ type: "NEW_VISIT", data: populated });
      res.status(201).json(populated);
    } catch (err) {
      console.error("❌ POST /api/visits error:", err.message);

      // Return a clean message for duplicate key errors (safety net)
      if (err.code === 11000) {
        return res.status(409).json({
          message: "Visit ID conflict detected. Please try again — the system will auto-resolve it.",
        });
      }

      res.status(500).json({ message: err.message });
    }
  });

  // ── PATCH /api/visits/:id/status ───────────────────────────
  router.patch("/:id/status", protect, async (req, res) => {
    try {
      const { status } = req.body;
      const allowed = [
        "WAITING","VITALS_PENDING","VITALS_COMPLETED","IN_CONSULTATION",
        "COMPLETED","ADMITTED","SURGERY","DISCHARGED",
      ];
      if (!allowed.includes(status)) {
        return res.status(400).json({ message: `Invalid status: ${status}` });
      }

      const current = await Visit.findById(req.params.id);
      if (!current) return res.status(404).json({ message: "Visit not found" });

      if (status === "IN_CONSULTATION" && !current.vitalsCompleted) {
        return res.status(400).json({
          message: "Cannot start consultation: vitals not recorded by Staff yet.",
        });
      }

      const update = { status };
      if (status === "IN_CONSULTATION") update.startedAt    = new Date();
      if (status === "COMPLETED")       update.completedAt  = new Date();
      if (status === "DISCHARGED")      update.dischargedAt = new Date();

      const visit = await Visit.findByIdAndUpdate(
        req.params.id, update, { new: true }
      ).populate("patientId", "name age gender bloodGroup phone patientId");

      await syncPatientStatus(visit);
      broadcast({ type: "VISIT_STATUS_CHANGED", data: visit });
      res.json(visit);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── PUT /api/visits/:id — doctor saves EMR ─────────────────
  router.put("/:id", protect, async (req, res) => {
    try {
      const allowedFields = [
        "complaints","diagnosis","treatment",
        "status","surgeryType","scheduledAt","surgeryNotes",
      ];
      const update = {};
      allowedFields.forEach(f => {
        if (req.body[f] !== undefined) update[f] = req.body[f];
      });

      if (update.status === "IN_CONSULTATION") update.startedAt    = new Date();
      if (update.status === "COMPLETED")       update.completedAt  = new Date();
      if (update.status === "DISCHARGED")      update.dischargedAt = new Date();

      const visit = await Visit.findByIdAndUpdate(
        req.params.id, update, { new: true }
      ).populate("patientId", "name age gender bloodGroup phone patientId");

      if (!visit) return res.status(404).json({ message: "Visit not found" });
      if (update.status) await syncPatientStatus(visit);

      broadcast({ type: "VISIT_UPDATED", data: visit });
      res.json(visit);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── POST /api/visits/:id/vitals ────────────────────────────
  router.post("/:id/vitals", protect, async (req, res) => {
    try {
      const { bp, pulse, spo2, temperature, sugar, weight, notes } = req.body;

      const currentVisit = await Visit.findById(req.params.id);
      if (!currentVisit) return res.status(404).json({ message: "Visit not found" });

      const statusUpdate =
        ["WAITING","VITALS_PENDING"].includes(currentVisit.status)
          ? { status: "VITALS_COMPLETED" }
          : {};

      const visit = await Visit.findByIdAndUpdate(
        req.params.id,
        {
          vitals: {
            bp:          bp          || "",
            pulse:       pulse       != null ? Number(pulse)       : null,
            spo2:        spo2        != null ? Number(spo2)        : null,
            temperature: temperature != null ? Number(temperature) : null,
            sugar:       sugar       != null ? Number(sugar)       : null,
            weight:      weight      != null ? Number(weight)      : null,
            notes:       notes       || "",
            recordedBy:  req.user.id,
            recordedAt:  new Date(),
          },
          vitalsCompleted: true,
          ...statusUpdate,
        },
        { new: true }
      ).populate("patientId", "name age gender bloodGroup phone patientId");

      if (!visit) return res.status(404).json({ message: "Visit not found" });

      broadcast({ type: "VITALS_UPDATED", data: visit });
      res.json(visit);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── POST /api/visits/:id/blood-requests ────────────────────
  router.post("/:id/blood-requests", protect, async (req, res) => {
    try {
      const visit = await Visit.findById(req.params.id)
        .populate("patientId", "name age gender bloodGroup phone patientId");
      if (!visit) return res.status(404).json({ message: "Visit not found" });

      if (["DISCHARGED","COMPLETED"].includes(visit.status)) {
        return res.status(400).json({
          message: `Cannot add blood request: visit is ${visit.status}.`,
        });
      }

      const patientBloodGroup = visit.patientId?.bloodGroup;
      if (!patientBloodGroup) {
        return res.status(400).json({
          message: "Patient blood group not found.",
        });
      }

      const { units, reason, priority } = req.body;
      if (!units || Number(units) < 1) {
        return res.status(400).json({ message: "units must be at least 1" });
      }

      visit.bloodRequests.push({
        bloodGroup:        patientBloodGroup,
        units:             Number(units),
        reason:            reason   || "",
        priority:          priority || "Normal",
        status:            "Requested By Doctor",
        requestedByDoctor: visit.doctorName,
      });
      await visit.save();

      const updated = await Visit.findById(visit._id)
        .populate("patientId", "name age gender bloodGroup phone patientId");

      broadcast({ type: "VISIT_UPDATED", data: updated });
      broadcast({
        type: "NEW_BLOOD_REQUEST",
        data: {
          visit:        updated,
          bloodRequest: updated.bloodRequests[updated.bloodRequests.length - 1],
          patientName:  updated.patientId?.name,
          visitId:      updated.visitId,
          department:   updated.department,
          doctorName:   updated.doctorName,
          bloodGroup:   patientBloodGroup,
          units:        Number(units),
          priority:     priority || "Normal",
          reason:       reason || "",
        },
      });

      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── POST /api/visits/:id/blood-requests/:brId/send ─────────
  router.post("/:id/blood-requests/:brId/send", protect, async (req, res) => {
    try {
      if (req.user.role === "Doctor") {
        return res.status(403).json({
          message: "Only Staff members can send blood requests to the Blood Bank.",
        });
      }

      const visit = await Visit.findById(req.params.id)
        .populate("patientId", "name age gender bloodGroup phone patientId");
      if (!visit) return res.status(404).json({ message: "Visit not found" });

      const br = visit.bloodRequests.id(req.params.brId);
      if (!br) return res.status(404).json({ message: "Blood request not found" });

      if (br.status !== "Requested By Doctor") {
        return res.status(400).json({
          message: `Only "Requested By Doctor" requests can be sent. Current: "${br.status}"`,
        });
      }

      const patient = visit.patientId;
      let bbOk = false;
      let bbId  = "";

      console.log(`\n📤 Sending to Blood Bank:`);
      console.log(`   URL: ${BLOOD_BANK_URL}/api/requests/from-hospital`);
      console.log(`   Patient: ${patient.name} | Blood: ${br.bloodGroup} | Units: ${br.units}`);
      console.log(`   hospitalRequestId (br._id): ${br._id.toString()}`);

      try {
        const bbRes = await axios.post(
          `${BLOOD_BANK_URL}/api/requests/from-hospital`,
          {
            hospitalRequestId: br._id.toString(),
            hospitalName:      "HealthCare Hospital",
            patientName:       patient.name,
            patientId:         patient.patientId || "",
            bloodGroup:        br.bloodGroup,
            units:             br.units,
            priority:          br.priority || "Normal",
            reason:            br.reason   || "",
            requestedBy:       visit.doctorName,
            department:        visit.department,
            notes:             br.reason   || "",
          },
          { timeout: 10000 }
        );
        bbId = bbRes.data?._id || "";
        bbOk = true;
        console.log(`✅ Blood Bank confirmed — bbId: ${bbId}`);
      } catch (bbErr) {
        console.error(`❌ Blood Bank POST failed!`);
        console.error(`   Message: ${bbErr.message}`);
        console.error(`   Code: ${bbErr.code}`);
        console.error(`   URL was: ${BLOOD_BANK_URL}/api/requests/from-hospital`);

        return res.status(503).json({
          message: `Blood Bank is unreachable. Please check if Blood Bank server is running on ${BLOOD_BANK_URL} and try again.`,
          error: bbErr.message,
          bloodBankReached: false,
        });
      }

      br.status             = "Sent to Blood Bank";
      br.bloodBankRequestId = bbId;
      await visit.save();

      const updated = await Visit.findById(visit._id)
        .populate("patientId", "name age gender bloodGroup phone patientId");

      broadcast({ type: "BLOOD_REQUEST_SENT", data: updated });
      console.log(`✅ Visit br status updated → Sent to Blood Bank`);

      res.json({ visit: updated, bloodBankReached: true });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  // ── PATCH /api/visits/:id/blood-requests/:brId/status ──────
  router.patch("/:id/blood-requests/:brId/status", async (req, res) => {
    try {
      const { status, fulfilledAt } = req.body;
      const allowedStatuses = ["Approved","Rejected","Fulfilled"];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          message: `Invalid status. Allowed: ${allowedStatuses.join(", ")}`,
        });
      }

      const visit = await Visit.findById(req.params.id)
        .populate("patientId", "name age gender bloodGroup phone patientId");
      if (!visit) return res.status(404).json({ message: "Visit not found" });

      const br = visit.bloodRequests.id(req.params.brId);
      if (!br) return res.status(404).json({ message: "Blood request not found" });

      br.status = status;
      if (status === "Fulfilled") {
        br.fulfilledAt = fulfilledAt ? new Date(fulfilledAt) : new Date();
      }
      await visit.save();

      const updated = await Visit.findById(visit._id)
        .populate("patientId", "name age gender bloodGroup phone patientId");

      broadcast({ type: "BLOOD_REQUEST_STATUS_UPDATED", data: updated });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  });

  return router;
};