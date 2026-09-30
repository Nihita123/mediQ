/**
 * routes/sessionRoutes.js — Triage Session routes
 *
 * All routes require authentication.
 */

const express = require('express');
const { param, query } = require('express-validator');

const {
  createSession,
  getSessionHistory,
  getSession,
  updateSession,
  deleteSession,
} = require('../controllers/sessionController');
const { protect } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validateMiddleware');

const router = express.Router();

// Apply auth middleware to all session routes
router.use(protect);

// ─── Validation ───────────────────────────────────────────────────────────────

const sessionIdValidation = [
  param('id').isMongoId().withMessage('Invalid session ID'),
];

const historyValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('limit must be between 1 and 200'),
];

// POST /api/session/create
router.post('/create', createSession);

// GET /api/session/history
router.get('/history', historyValidation, validate, getSessionHistory);

// GET /api/session/:id
router.get('/:id', sessionIdValidation, validate, getSession);

// PUT /api/session/:id
router.put('/:id', sessionIdValidation, validate, updateSession);

// DELETE /api/session/:id
router.delete('/:id', sessionIdValidation, validate, deleteSession);

module.exports = router;
