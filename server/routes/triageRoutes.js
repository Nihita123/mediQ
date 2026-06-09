/**
 * routes/triageRoutes.js — Triage conversation API routes
 *
 * All routes require a valid JWT (protect middleware).
 */

const express = require('express');
const { body } = require('express-validator');

const {
  startTriage,
  sendMessage,
  getTriageSession,
  getTriageHistory,
} = require('../controllers/triageController');
const { protect } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validateMiddleware');

const router = express.Router();

// All triage routes are protected
router.use(protect);

// ─── Validation ───────────────────────────────────────────────────────────────

const sendMessageValidation = [
  body('sessionId').notEmpty().withMessage('sessionId is required'),
  body('message')
    .trim()
    .notEmpty()
    .withMessage('message cannot be empty')
    .isLength({ max: 2000 })
    .withMessage('message cannot exceed 2000 characters'),
];

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/triage/start
router.post('/start', startTriage);

// POST /api/triage/message
router.post('/message', sendMessageValidation, validate, sendMessage);

// GET /api/triage/history  — must come BEFORE /:sessionId to avoid param clash
router.get('/history', getTriageHistory);

// GET /api/triage/:sessionId
router.get('/:sessionId', getTriageSession);

module.exports = router;
