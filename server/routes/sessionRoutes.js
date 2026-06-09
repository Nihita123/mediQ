/**
 * routes/sessionRoutes.js — Triage Session routes
 *
 * All routes require authentication.
 */

const express = require('express');
const {
  createSession,
  getSessionHistory,
  getSession,
  updateSession,
  deleteSession,
} = require('../controllers/sessionController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Apply auth middleware to all session routes
router.use(protect);

// POST /api/session/create
router.post('/create', createSession);

// GET /api/session/history
router.get('/history', getSessionHistory);

// GET /api/session/:id
router.get('/:id', getSession);

// PUT /api/session/:id
router.put('/:id', updateSession);

// DELETE /api/session/:id
router.delete('/:id', deleteSession);

module.exports = router;
