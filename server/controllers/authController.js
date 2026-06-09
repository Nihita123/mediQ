/**
 * controllers/authController.js — Authentication controller
 *
 * Handles user registration, login, and profile retrieval.
 */

const User = require('../models/userModel');
const generateToken = require('../utils/generateToken');
const asyncHandler = require('../utils/asyncHandler');

// ─── Register ─────────────────────────────────────────────────────────────────

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    res.status(409);
    throw new Error('An account with this email already exists');
  }

  // Create user (password is hashed by the pre-save hook)
  const user = await User.create({
    name,
    email,
    password,
    // Only allow patient self-registration; admins create doctors separately
    role: role === 'patient' ? 'patient' : 'patient',
  });

  const token = generateToken(user._id);

  res.status(201).json({
    message: 'Account created successfully',
    token,
    user: user.toSafeObject(),
  });
});

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and return JWT
 * @access  Public
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Explicitly select password since it's excluded by default
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    res.status(401);
    throw new Error('Invalid email or password');
  }

  if (!user.isActive) {
    res.status(401);
    throw new Error('Your account has been deactivated. Please contact support.');
  }

  const token = generateToken(user._id);

  res.json({
    message: 'Login successful',
    token,
    user: user.toSafeObject(),
  });
});

// ─── Get Current User ─────────────────────────────────────────────────────────

/**
 * @route   GET /api/auth/me
 * @desc    Return the authenticated user's profile
 * @access  Private
 */
const getMe = asyncHandler(async (req, res) => {
  // req.user is attached by the protect middleware
  res.json({ user: req.user });
});

// ─── Update Profile ───────────────────────────────────────────────────────────

/**
 * @route   PUT /api/auth/profile
 * @desc    Update the authenticated user's name or password
 * @access  Private
 */
const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');

  const { name, currentPassword, newPassword } = req.body;

  if (name) user.name = name;

  if (currentPassword && newPassword) {
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      res.status(400);
      throw new Error('Current password is incorrect');
    }
    user.password = newPassword;
  }

  const updated = await user.save();

  res.json({
    message: 'Profile updated successfully',
    user: updated.toSafeObject(),
  });
});

module.exports = { register, login, getMe, updateProfile };
