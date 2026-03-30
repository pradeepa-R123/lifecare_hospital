// FILE: backend/models/Visit.js

const mongoose = require("mongoose");

// ── Vitals sub-schema ─────────────────────────────────────────
const VitalSchema = new mongoose.Schema(
  {
    bp:          { type: String, default: "" },
    pulse:       { type: Number, default: null },
    spo2:        { type: Number, default: null },
    temperature: { type: Number, default: null },
    sugar:       { type: Number, default: null },
    weight:      { type: Number, default: null },
    notes:       { type: String, default: "" },
    recordedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    recordedAt:  { type: Date,   default: Date.now },
  },
  { _id: false }
);

// ── Embedded blood request sub-schema ─────────────────────────
const BloodRequestEmbedSchema = new mongoose.Schema(
  {
    bloodGroup: { type: String, required: true },
    units:      { type: Number, required: true, min: 1 },
    reason:     { type: String, default: "" },
    priority: {
      type:    String,
      enum:    ["Normal", "Urgent", "Emergency"],
      default: "Normal",
    },
    status: {
      type: String,
      enum: [
        "Requested By Doctor",
        "Sent to Blood Bank",
        "Approved",
        "Rejected",
        "Fulfilled",
      ],
      default: "Requested By Doctor",
    },
    requestedByDoctor:  { type: String, default: "" },
    bloodBankRequestId: { type: String, default: "" },
    createdAt:          { type: Date, default: Date.now },
    fulfilledAt:        { type: Date, default: null },
  },
  { _id: true }
);

// ── Main Visit schema ─────────────────────────────────────────
const VisitSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────────
    visitId:    { type: String, unique: true, sparse: true },
    patientId:  { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    patientRef: { type: String, default: "" },

    // ── Assignment ───────────────────────────────────────────
    doctorId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    doctorName: { type: String, required: true },
    department: { type: String, required: true },

    // ── Visit status ─────────────────────────────────────────
    status: {
      type: String,
      enum: [
        "WAITING",
        "VITALS_PENDING",
        "VITALS_COMPLETED",
        "IN_CONSULTATION",
        "COMPLETED",
        "ADMITTED",
        "SURGERY",
        "DISCHARGED",
      ],
      default: "WAITING",
    },

    // ── Vitals gate ──────────────────────────────────────────
    vitalsCompleted: { type: Boolean, default: false },

    // ── Clinical notes ───────────────────────────────────────
    complaints:  { type: String, default: "" },
    diagnosis:   { type: String, default: "" },
    treatment:   { type: String, default: "" },

    // ── Vitals ───────────────────────────────────────────────
    vitals: { type: VitalSchema, default: null },

    // ── Blood requests ───────────────────────────────────────
    bloodRequests: {
      type:    [BloodRequestEmbedSchema],
      default: [],
    },

    // ── Surgery details ──────────────────────────────────────
    surgeryType:  { type: String, default: "" },
    scheduledAt:  { type: Date,   default: null },
    surgeryNotes: { type: String, default: "" },

    // ── Audit ────────────────────────────────────────────────
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    startedAt:    { type: Date, default: null },
    completedAt:  { type: Date, default: null },
    dischargedAt: { type: Date, default: null },

    // ── Date string for fast filtering ───────────────────────
    visitDate: { type: String, default: "" },
  },
  {
    timestamps: true,
  }
);

// ── Indexes ────────────────────────────────────────────────────
VisitSchema.index({ doctorName: 1, visitDate: 1 });
VisitSchema.index({ patientId: 1, createdAt: -1 });
VisitSchema.index({ department: 1, visitDate: 1 });
VisitSchema.index({ status: 1 });
VisitSchema.index({ visitDate: 1 });

// ── Pre-save hook ──────────────────────────────────────────────
// visitId is now generated in the route BEFORE create() is called,
// so this hook only handles the visitDate field.
// The visitId block below is a safety fallback only — it will never
// run in normal flow because the route always pre-generates the ID.
VisitSchema.pre("save", async function (next) {
  // ── visitDate: set once on creation ───────────────────────
  if (!this.visitDate) {
    const d    = new Date();
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, "0");
    const dd   = String(d.getDate()).padStart(2, "0");
    this.visitDate = `${yyyy}-${mm}-${dd}`;
  }

  // ── visitId: safety fallback only ─────────────────────────
  // The route (routes/visits.js → generateVisitId()) should always
  // supply a visitId before calling Visit.create(). This block only
  // runs if somehow visitId is missing (e.g. direct DB scripts).
  if (!this.visitId) {
    try {
      const yr    = new Date().getFullYear();
      const count = await mongoose.model("Visit").countDocuments();
      // Use timestamp+random to avoid collisions in the fallback path
      const ts   = Date.now().toString().slice(-5);
      const rand = String(Math.floor(Math.random() * 100)).padStart(2, "0");
      this.visitId = `V-${yr}-${ts}${rand}`;
      console.warn(`⚠ visitId was missing — fallback generated: ${this.visitId}`);
    } catch (err) {
      return next(err);
    }
  }

  next();
});

// ── Instance method ────────────────────────────────────────────
VisitSchema.methods.hasVitals = function () {
  return this.vitals !== null && this.vitalsCompleted === true;
};

// ── Statics ────────────────────────────────────────────────────
VisitSchema.statics.getByDoctorAndDate = function (doctorName, dateStr) {
  return this.find({ doctorName, visitDate: dateStr })
    .populate("patientId", "name age gender bloodGroup phone patientId")
    .sort({ createdAt: -1 });
};

VisitSchema.statics.getDatesForDoctor = async function (doctorName) {
  const result = await this.distinct("visitDate", { doctorName });
  return result.sort((a, b) => b.localeCompare(a));
};

module.exports = mongoose.model("Visit", VisitSchema);