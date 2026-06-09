/**
 * models/reportModel.js — Medical Report Mongoose schema
 *
 * A Report is the final structured output generated after a triage
 * session is completed. It is intended for review by a doctor.
 */

const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: [true, 'Report must be linked to a session'],
      unique: true, // One report per session
      index: true,
    },

    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Report must be linked to a patient'],
      index: true,
    },

    // Concise plain-language summary for the attending physician
    summary: {
      type: String,
      required: [true, 'Report summary is required'],
      maxlength: [5000, 'Summary cannot exceed 5000 characters'],
    },

    // Ordered list of AI-generated clinical recommendations
    recommendations: {
      type: [String],
      default: [],
    },

    // Snapshot of symptoms extracted during the session
    symptoms: {
      type: [String],
      default: [],
    },

    // Risk level carried over from the session
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical', 'unknown'],
      default: 'unknown',
    },

    // Whether a doctor has reviewed this report
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Report = mongoose.model('Report', reportSchema);
module.exports = Report;
