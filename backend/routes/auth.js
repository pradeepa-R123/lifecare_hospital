const router = require("express").Router();
const jwt    = require("jsonwebtoken");
const User   = require("../models/User");

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role, department, specialization, experience, education, studiedAt } = req.body;
    if (!name || !email || !password || !role)
      return res.status(400).json({ message: "All fields required" });
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: "Email already registered" });
    const user = await User.create({
      name, email, password, role,
      department:     department     || "",
      specialization: specialization || "",
      experience:     experience     || "",
      education:      education      || "",
      studiedAt:      studiedAt      || "",
    });
    res.status(201).json({
      token: signToken(user._id),
      user:  { _id: user._id, name: user.name, email: user.email, role: user.role, department: user.department },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password)))
      return res.status(401).json({ message: "Invalid credentials" });
    res.json({
      token: signToken(user._id),
      user:  { _id: user._id, name: user.name, email: user.email, role: user.role, department: user.department },
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
