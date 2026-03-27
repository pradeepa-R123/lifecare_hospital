const router   = require("express").Router();
const User     = require("../models/User");
const { protect } = require("../middleware/auth");

router.get("/doctors", async (req, res) => {
  try {
    const doctors = await User.find({ role: "Doctor" }).select("-password").sort({ department: 1 });
    res.json(doctors);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put("/me", protect, async (req, res) => {
  try {
    const allowed = ["name","specialization","experience","education","studiedAt","certifications","achievements"];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select("-password");
    res.json(user);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
