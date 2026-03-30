const User      = require("../models/User");
const Bloodbank = require("../models/Bloodbank");
const Hospital  = require("../models/Hospital");

const HOSPITAL = {
  name: "HealthCare Hospital", address: "No. 12, Anna Salai",
  city: "Chennai", state: "Tamil Nadu", pincode: "600002", country: "India",
  contact: {
    mainLine:  "1800-LIFECARE", emergency: "1800-LIFECARE",
    ambulance: "+91-44-2345-6789", bloodBank: "+91-44-2345-6700",
    email: "info@lifecarehospital.in", website: "www.lifecarehospital.in",
  },
  timings: { opd: "Mon–Sat, 9:00 AM – 5:00 PM", emergency: "24/7 (All days)" },
  location: {
    latitude: 13.0604, longitude: 80.2496,
    mapUrl: "https://maps.google.com/?q=Anna+Salai+Chennai"
  },
  departments: [
    { name:"Cardiology",        icon:"❤️",  description:"Advanced heart care and interventional cardiology" },
    { name:"Neurology",         icon:"🧠",  description:"Comprehensive brain and nervous system treatments" },
    { name:"Orthopedics",       icon:"🦴",  description:"Joint replacement and bone surgery specialists" },
    { name:"Emergency",         icon:"🚨",  description:"24/7 emergency and trauma care" },
    // ✅ CHANGE: "Pediatrics" → "General Physician"
    { name:"General Physician", icon:"🩺",  description:"General medicine and primary healthcare" },
  ],
  accreditation: "NABH Accredited", established: 2000,
  tagline: "Advanced Care, Compassionate Healing",
  stats: { patientsTreated:"50K+", specialists:5, yearsOfCare:"25+", bedsAvailable:200 },
};

const DOCTORS = [
  { name:"Dr. Ravi",   email:"ravi@lifecare.com",
    department:"Cardiology",        specialization:"Interventional Cardiology",
    experience:"16 yrs", education:"MBBS, DM",  studiedAt:"AIIMS Delhi" },
  { name:"Dr. Ramesh", email:"ramesh@lifecare.com",
    department:"Neurology",         specialization:"Neurosurgery",
    experience:"11 yrs", education:"MBBS, DM",  studiedAt:"CMC Vellore" },
  { name:"Dr. Meena",  email:"meena@lifecare.com",
    department:"Orthopedics",       specialization:"Joint Replacement Surgery",
    experience:"10 yrs", education:"MBBS, MS",  studiedAt:"JIPMER Puducherry" },
  { name:"Dr. Suresh", email:"suresh@lifecare.com",
    department:"Emergency",         specialization:"Emergency & Trauma Medicine",
    experience:"8 yrs",  education:"MBBS, MD",  studiedAt:"Madras Medical College" },
  // ✅ CHANGE: department "General Physician", updated specialization
  { name:"Dr. Priya",  email:"priya@lifecare.com",
    department:"General Physician", specialization:"General Medicine & Primary Care",
    experience:"7 yrs",  education:"MBBS, DCH", studiedAt:"SRMC Chennai" },
];

const OTHERS = [
  { name:"Maran", email:"maran@lifecare.com",      role:"Receptionist", department:"" },
  // ✅ CHANGE: role label "Staff" (not "Nurse")
  { name:"Priya", email:"nursepriya@lifecare.com", role:"Staff",        department:"General" },
];

const BLOOD_BANKS = [{
  name:     "LifeCare Blood Bank",
  location: "T. Nagar, Chennai",
  phone:    "+91-44-2345-6700",
  status:   "Open 24/7",
  stock: {
    A_pos:0, A_neg:0, B_pos:0, B_neg:0,
    O_pos:0, O_neg:0, AB_pos:0, AB_neg:0
  },
}];

module.exports = async function seed() {
  try {
    await Hospital.deleteMany({});
    await Hospital.create(HOSPITAL);
    console.log("✅ Hospital seeded: HealthCare Hospital, Anna Salai, Chennai");

    await Bloodbank.deleteMany({});
    await Bloodbank.insertMany(BLOOD_BANKS);
    console.log("✅ Blood bank seeded");

    for (const d of DOCTORS) {
      if (!(await User.findOne({ email: d.email }))) {
        await User.create({ ...d, role: "Doctor", password: "Doctor@123" });
        console.log("✅ Doctor: " + d.name + " – " + d.department);
      }
    }
    for (const u of OTHERS) {
      if (!(await User.findOne({ email: u.email }))) {
        await User.create({ ...u, password: "Staff@123" });
        console.log("✅ " + u.role + ": " + u.name);
      }
    }
    console.log("ℹ️  Seed complete → Hospital ✅ | Blood Bank ✅ | Users: 7 ✅");
  } catch (err) { console.error("Seed error:", err.message); }
};