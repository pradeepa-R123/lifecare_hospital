const router  = require("express").Router();
const Surgery = require("../models/Surgery");
const { protect } = require("../middleware/auth");

router.get("/", protect, async (req, res) => {
  try {
    const filter = {};
    if (req.query.department) filter.department = req.query.department;
    if (req.query.doctorName) filter.doctorName = req.query.doctorName;
    if (req.query.today === "true") {
      const s = new Date(); s.setHours(0,0,0,0);
      const e = new Date(); e.setHours(23,59,59,999);
      filter.scheduledAt = { $gte: s, $lte: e };
    }
    const list = await Surgery.find(filter).sort({ scheduledAt: 1 });
    res.json(list);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post("/", protect, async (req, res) => {
  try {
    const s = await Surgery.create({ ...req.body, scheduledBy: req.user.id });
    res.status(201).json(s);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch("/:id/status", protect, async (req, res) => {
  try {
    const s = await Surgery.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (!s) return res.status(404).json({ message: "Not found" });
    res.json(s);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
