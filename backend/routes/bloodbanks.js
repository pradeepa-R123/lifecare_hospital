const router    = require("express").Router();
const Bloodbank = require("../models/Bloodbank");
const { protect } = require("../middleware/auth");
const axios     = require("axios");

const BLOOD_BANK_URL = process.env.BLOOD_BANK_URL || "http://localhost:5002";

const BG_MAP = {
  "A+":"A_pos","A-":"A_neg","B+":"B_pos","B-":"B_neg",
  "O+":"O_pos","O-":"O_neg","AB+":"AB_pos","AB-":"AB_neg",
};

async function fetchLiveInventory() {
  try {
    const res = await axios.get(`${BLOOD_BANK_URL}/api/inventory/hospital-view`, { timeout: 4000 });
    const stock = { A_pos:0,A_neg:0,B_pos:0,B_neg:0,O_pos:0,O_neg:0,AB_pos:0,AB_neg:0 };
    const items = res.data?.inventory || [];
    for (const item of items) {
      const key = BG_MAP[item.bloodGroup];
      if (key) stock[key] = item.units ?? 0;
    }
    return stock;
  } catch {
    return null;
  }
}

router.get("/", protect, async (req, res) => {
  try {
    const banks     = await Bloodbank.find().sort({ name: 1 });
    const liveStock = await fetchLiveInventory();
    const result    = banks.map(bank => {
      const obj = bank.toObject();
      if (liveStock && bank.name === "LifeCare Blood Bank") {
        obj.stock   = liveStock;
        obj.liveSync = true;
      }
      return obj;
    });
    res.json(result);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get("/:id", protect, async (req, res) => {
  try {
    const bank = await Bloodbank.findById(req.params.id);
    if (!bank) return res.status(404).json({ message: "Not found" });
    const obj = bank.toObject();
    if (bank.name === "LifeCare Blood Bank") {
      const liveStock = await fetchLiveInventory();
      if (liveStock) { obj.stock = liveStock; obj.liveSync = true; }
    }
    res.json(obj);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.patch("/:id/stock", protect, async (req, res) => {
  try {
    const bank = await Bloodbank.findByIdAndUpdate(
      req.params.id, { $set: { stock: req.body.stock } }, { new: true }
    );
    if (!bank) return res.status(404).json({ message: "Not found" });
    res.json(bank);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
