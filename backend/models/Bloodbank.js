const mongoose = require("mongoose");

const BloodbankSchema = new mongoose.Schema(
  {
    name:     { type: String, required: true },
    location: { type: String, required: true },
    phone:    { type: String, required: true },
    status:   { type: String, default: "Open 24/7" },
    stock: {
      A_pos:  { type: Number, default: 0 },
      A_neg:  { type: Number, default: 0 },
      B_pos:  { type: Number, default: 0 },
      B_neg:  { type: Number, default: 0 },
      O_pos:  { type: Number, default: 0 },
      O_neg:  { type: Number, default: 0 },
      AB_pos: { type: Number, default: 0 },
      AB_neg: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Bloodbank", BloodbankSchema);
