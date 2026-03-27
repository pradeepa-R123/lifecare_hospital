// FILE: backend/models/Visit.js
// +++ NEW FILE (add to backend/models/)

const mongoose = require("mongoose");

const VitalSchema = new mongoose.Schema({
  bp:          { type: String,  default: "" },
  pulse:       { type: Number,  default: null },
  spo2:        { type: Number,  default: null },
  temperature: { type: Number,  default: null },
  sugar:       { type: Number,  default: null },
  weight:      { type: Number,  default: null },
  notes:       { type: String,  default: "" },
  recordedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  recordedAt:  { type: Date,    default: Date.now },
}, { _id: false });

const BloodRequestEmbedSchema = new mongoose.Schema({
  bloodGroup: { type: String, required: true },
  units:      { type: Number, required: true, min: 1 },
  reason:     { type: String, default: "" },
  priority:   { type: String, default: "Normal" },
  status: {
    type: String,
    enum: ["PENDING", "SENT_TO_BLOODBANK", "APPROVED", "REJECTED", "FULFILLED"],
    default: "PENDING",
  },
  bloodBankRequestId: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const VisitSchema = new mongoose.Schema({
  visitId:    { type: String, unique: true },
  patientId:  { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
  patientRef: { type: String, default: "" },

  doctorId:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  doctorName: { type: String, required: true },
  department: { type: String, required: true },

  status: {
    type: String,
    enum: ["WAITING", "IN_CONSULTATION", "COMPLETED", "ADMITTED", "SURGERY", "DISCHARGED"],
    default: "WAITING",
  },

  complaints:  { type: String, default: "" },
  diagnosis:   { type: String, default: "" },
  treatment:   { type: String, default: "" },

  vitals: { type: VitalSchema, default: null },

  bloodRequests: [BloodRequestEmbedSchema],

  surgeryType:  { type: String, default: "" },
  scheduledAt:  { type: Date,   default: null },
  surgeryNotes: { type: String, default: "" },

  registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  startedAt:    { type: Date, default: null },
  completedAt:  { type: Date, default: null },
  dischargedAt: { type: Date, default: null },

}, { timestamps: true });

VisitSchema.pre("save", async function (next) {
  if (!this.visitId) {
    const n  = await mongoose.model("Visit").countDocuments();
    const yr = new Date().getFullYear();
    this.visitId = `V-${yr}-${String(n + 1).padStart(4, "0")}`;
  }
  next();
});

module.exports = mongoose.model("Visit", VisitSchema);