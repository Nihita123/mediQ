/**
 * routes/reportRoutes.js — Medical Report routes
 *
 * All routes require authentication.
 */

const express = require('express');
const { body, param, query } = require('express-validator');

const { createReport, getReport, getPatientReports } = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');
const { validate } = require('../middleware/validateMiddleware');

const router = express.Router();

router.use(protect);

// ─── Validation ───────────────────────────────────────────────────────────────

const createReportValidation = [
  body('sessionId')
    .notEmpty().withMessage('sessionId is required')
    .isMongoId().withMessage('sessionId must be a valid ID'),
  body('summary')
    .trim()
    .notEmpty().withMessage('summary is required')
    .isLength({ max: 5000 }).withMessage('summary cannot exceed 5000 characters'),
  body('recommendations')
    .optional()
    .isArray().withMessage('recommendations must be an array'),
  body('recommendations.*')
    .optional()
    .isString().withMessage('each recommendation must be a string')
    .isLength({ max: 500 }).withMessage('each recommendation cannot exceed 500 characters'),
];

// POST /api/report/create
router.post('/create', createReportValidation, validate, createReport);

// GET /api/report/patient/:patientId
router.get(
  '/patient/:patientId',
  [param('patientId').isMongoId().withMessage('Invalid patient ID')],
  validate,
  getPatientReports
);

// GET /api/report/:id
router.get(
  '/:id',
  [param('id').isMongoId().withMessage('Invalid report ID')],
  validate,
  getReport
);

module.exports = router;
