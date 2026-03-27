const router   = require("express").Router();
const Hospital = require("../models/Hospital");

router.get("/", async (req, res) => {
  try {
    const hospital = await Hospital.findOne();
    if (!hospital) return res.status(404).json({ message: "Hospital not found" });
    res.json(hospital);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
