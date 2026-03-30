const router       = require("express").Router();
const BloodRequest = require("../models/BloodRequest");
const { protect }  = require("../middleware/auth");
const axios        = require("axios");

const BLOOD_BANK_URL = process.env.BLOOD_BANK_URL || "http://localhost:5002";

module.exports = (broadcast) => {

  // ── GET all blood requests ────────────────────────────────────────────────
  router.get("/", protect, async (req, res) => {
    try {
      const requests = await BloodRequest.find().sort({ createdAt: -1 });
      res.json(requests);
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // ── POST create new blood request ─────────────────────────────────────────
  // ✅ Accepts ANY units (min 1) and ANY priority — never blocks
  router.post("/", protect, async (req, res) => {
    try {
      const {
        patientId, patientName, doctorName, department,
        bloodGroup, units, reason, priority,
      } = req.body;

      if (!patientName || !bloodGroup || !units)
        return res.status(400).json({ message: "patientName, bloodGroup and units required" });

      const br = await BloodRequest.create({
        patientId,
        patientName,
        doctorName,
        department,
        bloodGroup,
        units:       parseInt(units),           // ✅ always accept any units
        reason:      reason   || "",
        priority:    priority || "Normal",       // ✅ always accept any priority
        requestedBy: req.user.id,
        status:      "Pending",
      });

      console.log(`✅ Blood request created: ${patientName} | ${bloodGroup} | ${units}u | ${priority || "Normal"}`);
      broadcast({ type: "NEW_REQUEST", data: br });
      res.status(201).json(br);
    } catch (err) {
      console.error("❌ Create blood request error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ── POST send to blood bank ───────────────────────────────────────────────
  // ✅ Allows Pending OR Requested By Doctor status
  // ✅ Sends ANY units and ANY priority — no blocking
  router.post("/:id/send-to-bank", protect, async (req, res) => {
    try {
      const br = await BloodRequest.findById(req.params.id);
      if (!br) return res.status(404).json({ message: "Request not found" });

      console.log(`📤 Sending to blood bank: ${BLOOD_BANK_URL} | Request: ${br._id} | ${br.bloodGroup} | ${br.units}u | ${br.priority}`);

      // ✅ Allow both Pending and Requested By Doctor to be sent
      const sendableStatuses = ["Pending", "Requested By Doctor"];
      if (!sendableStatuses.includes(br.status))
        return res.status(400).json({ message: `Cannot send — current status is: ${br.status}` });

      const payload = {
        hospitalRequestId: br._id.toString(),   // ✅ unique per blood request
        hospitalName:      "HealthCare Hospital",
        patientName:       br.patientName,
        patientId:         br.patientId   || "",
        bloodGroup:        br.bloodGroup,
        units:             br.units,             // ✅ send actual units (any amount)
        priority:          br.priority || "Normal", // ✅ send actual priority (any value)
        reason:            br.reason      || "",
        department:        br.department  || "",
        requestedBy:       br.doctorName  || "",
      };

      let bloodBankRequestId = null;
      try {
        const bbRes = await axios.post(
          `${BLOOD_BANK_URL}/api/requests/from-hospital`, payload, { timeout: 5000 }
        );
        bloodBankRequestId = bbRes.data?._id || null;
        console.log(`✅ Blood bank accepted request: ${bloodBankRequestId}`);
      } catch (bbErr) {
        console.error("❌ Blood Bank unreachable:", bbErr.message);
        return res.status(502).json({ message: "Blood Bank server unreachable. Try again." });
      }

      const updated = await BloodRequest.findByIdAndUpdate(
        req.params.id,
        {
          status:          "Sent to Blood Bank",
          bloodBankName:   "LifeCare Blood Bank",
          bloodBankRequestId,
          statusUpdatedAt: new Date(),
        },
        { new: true }
      );

      broadcast({ type: "UPDATE_REQUEST", data: updated });
      res.json(updated);
    } catch (err) {
      console.error("❌ Send-to-bank error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ── PATCH status update (called by Blood Bank to sync back) ───────────────
  router.patch("/:id/status", async (req, res) => {
    try {
      const { status, bloodBankName, notes } = req.body;
      const allowed = [
        "Pending",
        "Requested By Doctor",
        "Sent to Blood Bank",
        "Approved",
        "Rejected",
        "Fulfilled",
      ];
      if (!allowed.includes(status))
        return res.status(400).json({ message: "Invalid status" });

      const update = { status, statusUpdatedAt: new Date() };
      if (bloodBankName) update.bloodBankName = bloodBankName;
      if (notes)         update.notes         = notes;

      const br = await BloodRequest.findByIdAndUpdate(
        req.params.id, update, { new: true }
      );
      if (!br) return res.status(404).json({ message: "Request not found" });

      console.log(`✅ Blood request status updated: ${br._id} → ${status}`);

      // ✅ Broadcast to all connected hospital clients in real time
      broadcast({ type: "UPDATE_REQUEST", data: br });
      res.json(br);
    } catch (err) {
      console.error("❌ Status update error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  // ── DELETE blood request ──────────────────────────────────────────────────
  router.delete("/:id", protect, async (req, res) => {
    try {
      const br = await BloodRequest.findByIdAndDelete(req.params.id);
      if (!br) return res.status(404).json({ message: "Not found" });
      broadcast({ type: "DELETE_REQUEST", data: { _id: req.params.id } });
      res.json({ message: "Deleted" });
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  return router;
};