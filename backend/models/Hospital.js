const mongoose = require("mongoose");

const HospitalSchema = new mongoose.Schema({
  name:    { type: String, required: true },
  address: { type: String, required: true },
  city:    { type: String, required: true },
  state:   { type: String, required: true },
  pincode: { type: String, required: true },
  country: { type: String, default: "India" },
  contact: {
    mainLine:  { type: String },
    emergency: { type: String },
    ambulance: { type: String },
    bloodBank: { type: String },
    email:     { type: String },
    website:   { type: String },
  },
  timings: {
    opd:       { type: String },
    emergency: { type: String },
  },
  location: {
    latitude:  { type: Number },
    longitude: { type: Number },
    mapUrl:    { type: String },
  },
  departments: [{
    name:        { type: String },
    icon:        { type: String },
    description: { type: String },
  }],
  accreditation: { type: String, default: "NABH Accredited" },
  established:   { type: Number, default: 2000 },
  tagline:       { type: String },
  stats: {
    patientsTreated: { type: String, default: "50K+" },
    specialists:     { type: Number, default: 5 },
    yearsOfCare:     { type: String, default: "25+" },
    bedsAvailable:   { type: Number, default: 200 },
  },
}, { timestamps: true });

module.exports = mongoose.model("Hospital", HospitalSchema);
