/**
 * routes/reportRoutes.js — Medical Report routes
 *
 * All routes require authentication.
 */

const express = require('express');
const { createReport, getReport, getPatientReports } = require('../controllers/reportController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

// POST /api/report/create
router.post('/create', createReport);

// GET /api/report/patient/:patientId
router.get('/patient/:patientId', getPatientReports);

// GET /api/report/:id
router.get('/:id', getReport);

module.exports = router;
