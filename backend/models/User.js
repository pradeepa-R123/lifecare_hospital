const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    name:           { type: String, required: true, trim: true },
    email:          { type: String, required: true, unique: true, lowercase: true },
    password:       { type: String, required: true },
    role:           { type: String, enum: ["Doctor", "Staff", "Receptionist"], required: true },
    department:     { type: String, default: "" },
    specialization: { type: String, default: "" },
    experience:     { type: String, default: "" },
    education:      { type: String, default: "" },
    studiedAt:      { type: String, default: "" },
    certifications: { type: String, default: "" },
    achievements:   { type: String, default: "" },
  },
  { timestamps: true }
);

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", UserSchema);
