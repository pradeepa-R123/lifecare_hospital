
const mongoose = require("mongoose");

const PatientSchema = new mongoose.Schema({
  patientId:   { type: String, unique: true },
  name:        { type: String, required: true, trim: true },
  age:         { type: Number, required: true },
  gender:      { type: String, enum: ["Male", "Female", "Other"], required: true },
  phone:       { type: String, default: "" },
  bloodGroup:  { type: String, required: true },
  symptoms:    { type: String, required: true },
  department:  { type: String, required: true },
  doctorName:  { type: String, required: true },
  doctorId:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  diagnosis:   { type: String, default: "" },
  treatment:   { type: String, default: "" },

  status: {
    type: String,
    enum: ["Waiting", "Admitted", "Surgery Scheduled"],
    default: "Waiting",
  },

  bloodNeeded:         { type: Boolean, default: false },
  bloodGroupRequired:  { type: String,  default: "" },
  bloodUnits:          { type: Number,  default: 0 },
  bloodRequestCreated: { type: Boolean, default: false },
  registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

PatientSchema.pre("save", async function (next) {
  if (!this.patientId) {
    const n = await mongoose.model("Patient").countDocuments();
    this.patientId = "LC-" + new Date().getFullYear() + "-" + String(n + 1).padStart(3, "0");
  }
  next();
});

module.exports = mongoose.model("Patient", PatientSchema);