/**
 * controllers/triageController.js — Triage Conversation Controller
 *
 * Handles the triage chat flow:
 *   POST /api/triage/start     — Create session, send greeting
 *   POST /api/triage/message   — Process patient message, return AI reply
 *   GET  /api/triage/:sessionId — Retrieve session with full state
 *   GET  /api/triage/history   — Paginated session list for the user
 */

const Session = require('../models/sessionModel');
const asyncHandler = require('../utils/asyncHandler');
const { processMessage, STATE } = require('../services/triageEngine');

// ─── Start Triage Session ─────────────────────────────────────────────────────

/**
 * @route   POST /api/triage/start
 * @desc    Create a new triage session and return the opening AI greeting
 * @access  Private
 */
const startTriage = asyncHandler(async (req, res) => {
  // Create session in STARTED state
  const session = await Session.create({
    userId: req.user._id,
    triageState: STATE.STARTED,
    status: 'active',
  });

  // Process the implicit first "turn" — gets the greeting message.
  // processMessage is async (LLM path) but the STARTED state always
  // returns synchronously without calling the LLM, so this is safe.
  const { reply } = await processMessage(session, '');

  // Persist the greeting as the first assistant message
  session.messages.push({
    role: 'assistant',
    content: reply,
    timestamp: new Date(),
  });

  await session.save();

  res.status(201).json({
    message: 'Triage session started',
    sessionId: session._id,
    triageState: session.triageState,
    aiReply: reply,
    extractedSymptoms: session.extractedSymptoms,
  });
});

// ─── Process Message ──────────────────────────────────────────────────────────

/**
 * @route   POST /api/triage/message
 * @desc    Accept a patient message, advance the state machine, return AI reply
 * @access  Private
 *
 * Body: { sessionId: string, message: string }
 */
const sendMessage = asyncHandler(async (req, res) => {
  const { sessionId, message } = req.body;

  if (!sessionId || !message?.trim()) {
    res.status(400);
    throw new Error('sessionId and message are required');
  }

  const session = await Session.findById(sessionId);

  if (!session) {
    res.status(404);
    throw new Error('Session not found');
  }

  // Ownership check
  if (session.userId.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to access this session');
  }

  if (session.status === 'cancelled') {
    res.status(400);
    throw new Error('This session has been cancelled');
  }

  const trimmedMessage = message.trim();

  // Append user message to history
  session.messages.push({
    role: 'user',
    content: trimmedMessage,
    timestamp: new Date(),
  });

  // Run through the state machine (async — may call LLM)
  const { reply } = await processMessage(session, trimmedMessage);

  // Append AI reply to history
  session.messages.push({
    role: 'assistant',
    content: reply,
    timestamp: new Date(),
  });

  await session.save();

  res.json({
    aiReply:            reply,
    triageState:        session.triageState,
    extractedSymptoms:  session.extractedSymptoms,
    answeredQuestions:  session.answeredQuestions,
    medicalEntities:    session.medicalEntities    || null,
    triageResult:       session.triageResult       || null,
    riskLevel:          session.riskLevel,
    department:         session.department,
    status:             session.status,
    aiEngine:           session.aiEngine,
    sessionComplete:    session.triageState === STATE.SUMMARY_READY,
  });
});

// ─── Get Session ──────────────────────────────────────────────────────────────

/**
 * @route   GET /api/triage/:sessionId
 * @desc    Retrieve a complete triage session
 * @access  Private — owner or doctor/admin
 */
const getTriageSession = asyncHandler(async (req, res) => {
  const session = await Session.findById(req.params.sessionId).populate(
    'userId',
    'name email'
  );

  if (!session) {
    res.status(404);
    throw new Error('Session not found');
  }

  const isOwner = session.userId._id.toString() === req.user._id.toString();
  const isPrivileged = ['doctor', 'admin'].includes(req.user.role);

  if (!isOwner && !isPrivileged) {
    res.status(403);
    throw new Error('Not authorized to access this session');
  }

  res.json({ session });
});

// ─── Session History ──────────────────────────────────────────────────────────

/**
 * @route   GET /api/triage/history
 * @desc    Paginated list of triage sessions for the authenticated user
 * @access  Private
 */
const getTriageHistory = asyncHandler(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 10);
  const skip  = (page - 1) * limit;

  const [sessions, total] = await Promise.all([
    Session.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-messages -answeredQuestions'), // Lean list view
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

module.exports = { startTriage, sendMessage, getTriageSession, getTriageHistory };
