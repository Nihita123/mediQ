/**
 * routes/authRoutes.js — Authentication routes
 */

const express = require('express');
const { body } = require('express-validator');

const { register, login, getMe, updateProfile } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validateMiddleware');

const router = express.Router();

// ─── Validation Rules ──────────────────────────────────────────────────────────

const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
];

const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/auth/register
router.post('/register', registerValidation, validate, register);

// POST /api/auth/login
router.post('/login', loginValidation, validate, login);

// GET /api/auth/me  (protected)
router.get('/me', protect, getMe);

// PUT /api/auth/profile  (protected)
router.put('/profile', protect, updateProfile);

module.exports = router;
