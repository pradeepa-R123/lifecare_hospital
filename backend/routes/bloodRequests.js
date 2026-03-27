const router       = require("express").Router();
const BloodRequest = require("../models/BloodRequest");
const { protect }  = require("../middleware/auth");
const axios        = require("axios");

const BLOOD_BANK_URL = process.env.BLOOD_BANK_URL || "http://localhost:5002";

module.exports = (broadcast) => {

  router.get("/", protect, async (req, res) => {
    try {
      const requests = await BloodRequest.find().sort({ createdAt: -1 });
      res.json(requests);
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  router.post("/", protect, async (req, res) => {
    try {
      const { patientId, patientName, doctorName, department, bloodGroup, units, reason } = req.body;
      if (!patientName || !bloodGroup || !units)
        return res.status(400).json({ message: "patientName, bloodGroup and units required" });
      const br = await BloodRequest.create({
        patientId, patientName, doctorName, department,
        bloodGroup, units, reason: reason || "",
        requestedBy: req.user.id, status: "Pending",
      });
      broadcast({ type: "NEW_REQUEST", data: br });
      res.status(201).json(br);
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  router.post("/:id/send-to-bank", protect, async (req, res) => {
    try {
      const br = await BloodRequest.findById(req.params.id);
      if (!br) return res.status(404).json({ message: "Request not found" });
      if (br.status !== "Pending")
        return res.status(400).json({ message: "Only Pending requests can be sent" });

      const payload = {
        hospitalRequestId: br._id.toString(),
        hospitalName:      "HealthCare Hospital",
        patientName:       br.patientName,
        patientId:         br.patientId   || "",
        bloodGroup:        br.bloodGroup,
        units:             br.units,
        priority:          br.priority    || "Normal",
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
      } catch (bbErr) {
        console.error("❌ Blood Bank unreachable:", bbErr.message);
        return res.status(502).json({ message: "Blood Bank server unreachable. Try again." });
      }

      const updated = await BloodRequest.findByIdAndUpdate(
        req.params.id,
        { status: "Sent to Blood Bank", bloodBankName: "LifeCare Blood Bank",
          bloodBankRequestId, statusUpdatedAt: new Date() },
        { new: true }
      );
      broadcast({ type: "UPDATE_REQUEST", data: updated });
      res.json(updated);
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

  // Called by Blood Bank to update status — no auth
  router.patch("/:id/status", async (req, res) => {
    try {
      const { status, bloodBankName, notes } = req.body;
      const allowed = ["Pending","Sent to Blood Bank","Approved","Rejected","Fulfilled"];
      if (!allowed.includes(status))
        return res.status(400).json({ message: "Invalid status" });
      const update = { status, statusUpdatedAt: new Date() };
      if (bloodBankName) update.bloodBankName = bloodBankName;
      if (notes) update.notes = notes;
      const br = await BloodRequest.findByIdAndUpdate(req.params.id, update, { new: true });
      if (!br) return res.status(404).json({ message: "Request not found" });
      broadcast({ type: "UPDATE_REQUEST", data: br });
      res.json(br);
    } catch (err) { res.status(500).json({ message: err.message }); }
  });

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
