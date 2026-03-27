const mongoose = require("mongoose");

const SurgerySchema = new mongoose.Schema({
  patientName: { type: String, required: true },
  patientId:   { type: String, default: "" },
  surgeryType: { type: String, required: true },
  department:  { type: String, required: true },
  doctorName:  { type: String, required: true },
  scheduledAt: { type: Date,   required: true },
  notes:       { type: String, default: "" },
  status:      { type: String, enum: ["Scheduled","In Progress","Completed","Cancelled"], default: "Scheduled" },
  scheduledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

module.exports = mongoose.model("Surgery", SurgerySchema);
