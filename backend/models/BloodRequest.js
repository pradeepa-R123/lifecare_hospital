const mongoose = require("mongoose");

const BloodRequestSchema = new mongoose.Schema({
  patientId:    { type: String, default: "" },
  patientName:  { type: String, required: true },
  doctorName:   { type: String, default: "" },
  department:   { type: String, default: "" },
  bloodGroup:   { type: String, required: true },
  units:        { type: Number, required: true, min: 1 },
  reason:       { type: String, default: "" },
  requestedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  bloodBankName:{ type: String, default: "" },
  status: {
    type: String,
    enum: ["Pending","Sent to Blood Bank","Approved","Rejected","Fulfilled"],
    default: "Pending",
  },
  statusUpdatedAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model("BloodRequest", BloodRequestSchema);
