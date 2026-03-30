const mongoose = require("mongoose");

const BloodRequestSchema = new mongoose.Schema({
  bloodGroup:  { type: String, default: "" },
  units:       { type: Number, default: 0 },
  urgency:     { type: String, enum: ["Normal","Urgent","Critical"], default: "Normal" },
  requestedAt: { type: Date, default: Date.now },
  status:      { type: String, enum: ["Pending","Fulfilled","Rejected"], default: "Pending" },
  notes:       { type: String, default: "" },
});

const SurgerySchema = new mongoose.Schema({
  patientName:  { type: String, required: true },
  patientId:    { type: String, required: true, index: true },
  surgeryType:  { type: String, required: true },
  department:   { type: String, required: true },
  doctorName:   { type: String, required: true },
  scheduledAt:  { type: Date,   required: true },
  notes:        { type: String, default: "" },
  status:       { type: String, enum: ["Scheduled","In Progress","Completed","Cancelled"], default: "Scheduled" },
  bloodRequest: { type: BloodRequestSchema, default: null },
  scheduledBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

module.exports = mongoose.model("Surgery", SurgerySchema);