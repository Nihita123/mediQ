/**
 * routes/triageRoutes.js — Triage conversation API routes
 *
 * All routes require a valid JWT (protect middleware).
 */

const express = require('express');
const { body, param, query } = require('express-validator');

const {
  startTriage,
  sendMessage,
  getTriageSession,
  getTriageHistory,
} = require('../controllers/triageController');
const { protect } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validateMiddleware');
const { triageStartLimiter, triageMessageLimiter } = require('../middleware/rateLimitMiddleware');

const router = express.Router();

// All triage routes are protected
router.use(protect);

// ─── Validation ───────────────────────────────────────────────────────────────

const sendMessageValidation = [
  body('sessionId')
    .notEmpty().withMessage('sessionId is required')
    .isMongoId().withMessage('sessionId must be a valid ID'),
  body('message')
    .trim()
    .notEmpty().withMessage('message cannot be empty')
    .isLength({ max: 2000 }).withMessage('message cannot exceed 2000 characters'),
];

const historyValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('limit must be between 1 and 200'),
];

const sessionIdValidation = [
  param('sessionId').isMongoId().withMessage('Invalid session ID'),
];

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/triage/start
router.post('/start', triageStartLimiter, startTriage);

// POST /api/triage/message
router.post('/message', triageMessageLimiter, sendMessageValidation, validate, sendMessage);

// GET /api/triage/history  — must come BEFORE /:sessionId to avoid param clash
router.get('/history', historyValidation, validate, getTriageHistory);

// GET /api/triage/:sessionId
router.get('/:sessionId', sessionIdValidation, validate, getTriageSession);

module.exports = router;
