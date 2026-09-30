/**
 * routes/authRoutes.js — Authentication routes
 */

const express = require('express');
const { body } = require('express-validator');

const { register, login, getMe, updateProfile } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validateMiddleware');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimitMiddleware');

const router = express.Router();

// ─── Validation Rules ──────────────────────────────────────────────────────────

const registerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),
  body('email')
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .isLength({ max: 128 }).withMessage('Password cannot exceed 128 characters'),
];

const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

const updateProfileValidation = [
  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('Name cannot be blank')
    .isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),
  body('newPassword')
    .optional()
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .isLength({ max: 128 }).withMessage('Password cannot exceed 128 characters'),
  // currentPassword is required whenever newPassword is provided
  body('currentPassword').custom((value, { req }) => {
    if (req.body.newPassword && !value) {
      throw new Error('Current password is required to set a new password');
    }
    return true;
  }),
];

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/auth/register
router.post('/register', registerLimiter, registerValidation, validate, register);

// POST /api/auth/login
router.post('/login', loginLimiter, loginValidation, validate, login);

// GET /api/auth/me  (protected)
router.get('/me', protect, getMe);

// PUT /api/auth/profile  (protected)
router.put('/profile', protect, updateProfileValidation, validate, updateProfile);

module.exports = router;
