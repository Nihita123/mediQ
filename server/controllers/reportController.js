/**
 * controllers/reportController.js — Medical Report controller
 */

const Report = require('../models/reportModel');
const Session = require('../models/sessionModel');
const asyncHandler = require('../utils/asyncHandler');

// ─── Create Report ────────────────────────────────────────────────────────────

/**
 * @route   POST /api/report/create
 * @desc    Generate a report from a completed session
 * @access  Private
 */
const createReport = asyncHandler(async (req, res) => {
  const { sessionId, summary, recommendations } = req.body;

  // Verify session exists and belongs to the requesting user
  const session = await Session.findById(sessionId);
  if (!session) {
    res.status(404);
    throw new Error('Session not found');
  }

  const isOwner = session.userId.toString() === req.user._id.toString();
  const isPrivileged = ['doctor', 'admin'].includes(req.user.role);

  if (!isOwner && !isPrivileged) {
    res.status(403);
    throw new Error('Not authorized to create a report for this session');
  }

  // Prevent duplicate reports per session (enforced by unique index too)
  const existing = await Report.findOne({ sessionId });
  if (existing) {
    res.status(409);
    throw new Error('A report for this session already exists');
  }

  const report = await Report.create({
    sessionId,
    patientId: session.userId,
    summary,
    recommendations: recommendations || [],
    symptoms: session.extractedSymptoms,
    riskLevel: session.riskLevel,
  });

  // Mark session as completed
  session.status = 'completed';
  await session.save();

  res.status(201).json({
    message: 'Report created successfully',
    report,
  });
});

// ─── Get Report ───────────────────────────────────────────────────────────────

/**
 * @route   GET /api/report/:id
 * @desc    Fetch a single report by ID
 * @access  Private — patient (own) or doctor/admin
 */
const getReport = asyncHandler(async (req, res) => {
  const report = await Report.findById(req.params.id)
    .populate('patientId', 'name email')
    .populate('sessionId', 'createdAt riskLevel status')
    .populate('reviewedBy', 'name email');

  if (!report) {
    res.status(404);
    throw new Error('Report not found');
  }

  const isOwner = report.patientId._id.toString() === req.user._id.toString();
  const isPrivileged = ['doctor', 'admin'].includes(req.user.role);

  if (!isOwner && !isPrivileged) {
    res.status(403);
    throw new Error('Not authorized to view this report');
  }

  res.json({ report });
});

// ─── Get Reports for Patient ──────────────────────────────────────────────────

/**
 * @route   GET /api/report/patient/:patientId
 * @desc    Return all reports for a patient
 * @access  Private — owner or privileged
 */
const getPatientReports = asyncHandler(async (req, res) => {
  const targetId = req.params.patientId;

  const isOwner = targetId === req.user._id.toString();
  const isPrivileged = ['doctor', 'admin'].includes(req.user.role);

  if (!isOwner && !isPrivileged) {
    res.status(403);
    throw new Error('Not authorized to view these reports');
  }

  const reports = await Report.find({ patientId: targetId })
    .sort({ createdAt: -1 })
    .populate('sessionId', 'createdAt riskLevel status');

  res.json({ reports });
});

module.exports = { createReport, getReport, getPatientReports };
