const router = require("express").Router();
const User   = require("../models/User");

// ✅ CHANGE: "Pediatrics" → "General Physician"
const DEPARTMENTS = [
  { name:"Cardiology",        icon:"❤️",  desc:"Heart & vascular care with advanced diagnostics" },
  { name:"Neurology",         icon:"🧠",  desc:"Brain, spine and nervous system disorders" },
  { name:"Orthopedics",       icon:"🦴",  desc:"Bone, joint & musculoskeletal surgery" },
  { name:"Emergency",         icon:"🚨",  desc:"24/7 critical & trauma care" },
  { name:"General Physician", icon:"🩺",  desc:"General medicine and primary healthcare" },
  { name:"Hematology",        icon:"🩸",  desc:"Blood disorders & oncology" },
  { name:"General Medicine",  icon:"💊",  desc:"Primary care & internal medicine" },
];

router.get("/", async (req, res) => {
  try {
    const depts = await Promise.all(
      DEPARTMENTS.map(async (d) => {
        const doctors = await User.find({ role:"Doctor", department:d.name })
          .select("name specialization experience");
        return { ...d, doctors };
      })
    );
    res.json(depts);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/:name", async (req, res) => {
  try {
    const dept = DEPARTMENTS.find(
      d => d.name.toLowerCase() === req.params.name.toLowerCase()
    );
    if (!dept) return res.status(404).json({ message: "Department not found" });
    const doctors = await User.find({ role:"Doctor", department:dept.name })
      .select("-password");
    res.json({ ...dept, doctors });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;