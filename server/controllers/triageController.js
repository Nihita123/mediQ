/**
 * controllers/triageController.js — Triage Conversation Controller
 *
 * Uses findByIdAndUpdate with $set for all session state updates.
 * This bypasses Mongoose dirty-tracking entirely and guarantees
 * every field written by the triage engine is persisted to MongoDB.
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
    userId:       req.user._id,
    triageState:  STATE.STARTED,
    status:       'active',
  });

  // Get the greeting — STARTED handler is synchronous, never calls LLM
  const { reply } = await processMessage(session, '');

  // Persist using $set so nothing is silently dropped
  await Session.findByIdAndUpdate(session._id, {
    $set: {
      triageState: session.triageState,
      aiEngine:    session.aiEngine,
    },
    $push: {
      messages: { role: 'assistant', content: reply, timestamp: new Date() },
    },
  });

  res.status(201).json({
    message:           'Triage session started',
    sessionId:         session._id,
    triageState:       session.triageState,
    aiReply:           reply,
    extractedSymptoms: [],
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

  // Load the full session from DB
  const session = await Session.findById(sessionId);

  if (!session) {
    res.status(404);
    throw new Error('Session not found');
  }

  if (session.userId.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to access this session');
  }

  if (session.status === 'cancelled') {
    res.status(400);
    throw new Error('This session has been cancelled');
  }

  const trimmedMessage = message.trim();

  // Run the triage engine — mutates session fields in memory
  const { reply } = await processMessage(session, trimmedMessage);

  // ── Persist EVERYTHING via $set ────────────────────────────────────────────
  // Using findByIdAndUpdate with $set guarantees every field is written to
  // MongoDB regardless of Mongoose dirty-tracking behaviour.
  // $push appends both the user message and AI reply atomically.
  await Session.findByIdAndUpdate(
    sessionId,
    {
      $set: {
        triageState:           session.triageState,
        extractedSymptoms:     session.extractedSymptoms,
        symptomKeys:           session.symptomKeys           || [],
        answeredQuestions:     session.answeredQuestions,
        lastAskedQuestionId:   session.lastAskedQuestionId   ?? null,
        lastAskedQuestionText: session.lastAskedQuestionText ?? null,
        clinicalContext:       session.clinicalContext        ?? null,
        interimRiskLevel:      session.interimRiskLevel       ?? 'unknown',
        medicalEntities:       session.medicalEntities       || {},
        triageResult:          session.triageResult          || {},
        riskLevel:             session.riskLevel,
        department:            session.department            ?? null,
        summary:               session.summary               ?? null,
        structuredSummary:     session.structuredSummary     ?? null,
        status:                session.status,
        aiEngine:              session.aiEngine,
      },
      $push: {
        messages: {
          $each: [
            { role: 'user',      content: trimmedMessage, timestamp: new Date() },
            { role: 'assistant', content: reply,          timestamp: new Date() },
          ],
        },
      },
    },
    { new: false } // we don't need the updated doc back — we already have all data
  );

  res.json({
    aiReply:           reply,
    triageState:       session.triageState,
    extractedSymptoms: session.extractedSymptoms,
    answeredQuestions: session.answeredQuestions,
    clinicalContext:   session.clinicalContext   || null,
    medicalEntities:   session.medicalEntities   || null,
    triageResult:      session.triageResult      || null,
    riskLevel:         session.interimRiskLevel  || session.riskLevel,
    department:        session.department,
    status:            session.status,
    aiEngine:          session.aiEngine,
    sessionComplete:   session.triageState === STATE.SUMMARY_READY,
  });
});

// ─── Get Session ──────────────────────────────────────────────────────────────

/**
 * @route   GET /api/triage/:sessionId
 * @desc    Retrieve a complete triage session
 * @access  Private — owner or doctor/admin
 */
const getTriageSession = asyncHandler(async (req, res) => {
  const session = await Session.findById(req.params.sessionId).populate('userId', 'name email');

  if (!session) {
    res.status(404);
    throw new Error('Session not found');
  }

  const isOwner      = session.userId._id.toString() === req.user._id.toString();
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
      .select('-messages -answeredQuestions'),
    Session.countDocuments({ userId: req.user._id }),
  ]);

  res.json({
    sessions,
    pagination: { total, page, limit, pages: Math.ceil(total / limit) },
  });
});

module.exports = { startTriage, sendMessage, getTriageSession, getTriageHistory };
