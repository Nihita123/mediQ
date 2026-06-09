/**
 * controllers/sessionController.js — Triage Session controller
 *
 * Handles creating, retrieving, and managing triage sessions.
 * AI processing hooks are left as clearly marked placeholders.
 */

const Session = require('../models/sessionModel');
const asyncHandler = require('../utils/asyncHandler');

// ─── Create Session ───────────────────────────────────────────────────────────

/**
 * @route   POST /api/session/create
 * @desc    Start a new triage session for the authenticated patient
 * @access  Private (patient)
 */
const createSession = asyncHandler(async (req, res) => {
  const session = await Session.create({
    userId: req.user._id,
    status: 'active',
  });

  res.status(201).json({
    message: 'Triage session created',
    session,
  });
});

// ─── Get Session History ──────────────────────────────────────────────────────

/**
 * @route   GET /api/session/history
 * @desc    Return all sessions for the authenticated user (paginated)
 * @access  Private
 */
const getSessionHistory = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 10);
  const skip = (page - 1) * limit;

  const [sessions, total] = await Promise.all([
    Session.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-messages'), // Exclude heavy message arrays from list view
    Session.countDocuments({ userId: req.user._id }),
  ]);

  res.json({
    sessions,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
});

// ─── Get Single Session ───────────────────────────────────────────────────────

/**
 * @route   GET /api/session/:id
 * @desc    Return a single session (with messages)
 * @access  Private — owner or doctor/admin
 */
const getSession = asyncHandler(async (req, res) => {
  const session = await Session.findById(req.params.id).populate(
    'userId',
    'name email'
  );

  if (!session) {
    res.status(404);
    throw new Error('Session not found');
  }

  // Patients can only access their own sessions
  const isOwner = session.userId._id.toString() === req.user._id.toString();
  const isPrivileged = ['doctor', 'admin'].includes(req.user.role);

  if (!isOwner && !isPrivileged) {
    res.status(403);
    throw new Error('Not authorized to access this session');
  }

  res.json({ session });
});

// ─── Update Session ───────────────────────────────────────────────────────────

/**
 * @route   PUT /api/session/:id
 * @desc    Update session data (e.g. add messages, update status)
 *          Called internally by the AI service layer — not directly by clients.
 * @access  Private
 */
const updateSession = asyncHandler(async (req, res) => {
  const session = await Session.findById(req.params.id);

  if (!session) {
    res.status(404);
    throw new Error('Session not found');
  }

  const isOwner = session.userId.toString() === req.user._id.toString();
  if (!isOwner) {
    res.status(403);
    throw new Error('Not authorized to update this session');
  }

  const allowedFields = ['messages', 'extractedSymptoms', 'riskLevel', 'department', 'summary', 'status'];

  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      session[field] = req.body[field];
    }
  });

  const updated = await session.save();
  res.json({ session: updated });
});

// ─── Delete Session ───────────────────────────────────────────────────────────

/**
 * @route   DELETE /api/session/:id
 * @desc    Soft-cancel a session
 * @access  Private — owner only
 */
const deleteSession = asyncHandler(async (req, res) => {
  const session = await Session.findById(req.params.id);

  if (!session) {
    res.status(404);
    throw new Error('Session not found');
  }

  if (session.userId.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to delete this session');
  }

  session.status = 'cancelled';
  await session.save();

  res.json({ message: 'Session cancelled' });
});

module.exports = {
  createSession,
  getSessionHistory,
  getSession,
  updateSession,
  deleteSession,
};
