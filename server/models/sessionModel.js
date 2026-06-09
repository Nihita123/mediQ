/**
 * models/sessionModel.js — Triage Session Mongoose schema (v2)
 *
 * A Session represents one complete intake & triage conversation.
 * v2 adds: triage state machine, answered/pending questions, and
 * a structured symptom map.
 */

const mongoose = require('mongoose');

// ─── Sub-schemas ───────────────────────────────────────────────────────────────

/** Individual chat message */
const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: [5000, 'Message content cannot exceed 5000 characters'],
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

/** A question that has already been asked and answered */
const answeredQuestionSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true }, // e.g. "chest_pain_onset"
    question:   { type: String, required: true }, // Human-readable question text
    answer:     { type: String, required: true }, // Patient's raw answer
    symptomKey: { type: String },                 // Which symptom this belongs to
  },
  { _id: false }
);

/**
 * Structured medical entities extracted by the LLM.
 * Stored separately from the flat extractedSymptoms array
 * to preserve richer context for the physician summary.
 */
const medicalEntitiesSchema = new mongoose.Schema(
  {
    symptoms:       { type: [String], default: [] },
    duration:       { type: String,   default: null },
    severity:       { type: String,   default: null },
    medicalHistory: { type: [String], default: [] },
    medications:    { type: [String], default: [] },
    allergies:      { type: [String], default: [] },
    vitalSigns:     { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

/**
 * Structured triage result produced by the LLM assessor.
 * Includes confidence score and explainable reasoning for doctors.
 */
const triageResultSchema = new mongoose.Schema(
  {
    riskLevel:         { type: String, default: 'unknown' },
    confidence:        { type: Number, default: 0 },
    department:        { type: String, default: null },
    urgency:           { type: String, default: null },
    reasoning:         { type: [String], default: [] },
    redFlags:          { type: [String], default: [] },
    suggestedFollowUp: { type: String, default: null },
    generatedBy:       { type: String, enum: ['llm', 'rules'], default: 'rules' },
  },
  { _id: false }
);

// ─── Triage State Machine Values ───────────────────────────────────────────────
/**
 * STARTED             — session just created
 * SYMPTOM_COLLECTION  — waiting for initial symptom description
 * FOLLOW_UP_QUESTIONS — AI is asking follow-up questions
 * ASSESSMENT_READY    — enough info gathered, building assessment
 * SUMMARY_READY       — final summary generated
 */
const TRIAGE_STATES = [
  'STARTED',
  'SYMPTOM_COLLECTION',
  'FOLLOW_UP_QUESTIONS',
  'ASSESSMENT_READY',
  'SUMMARY_READY',
];

// ─── Main Schema ───────────────────────────────────────────────────────────────

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Session must belong to a user'],
      index: true,
    },

    // Full conversation history
    messages: {
      type: [messageSchema],
      default: [],
    },

    // List of symptom string labels extracted from conversation
    extractedSymptoms: {
      type: [String],
      default: [],
    },

    // Triage state machine
    triageState: {
      type: String,
      enum: TRIAGE_STATES,
      default: 'STARTED',
    },

    // Questions that have been asked and answered
    answeredQuestions: {
      type: [answeredQuestionSchema],
      default: [],
    },

    // Queue of question IDs still to be asked (stored as strings)
    pendingQuestions: {
      type: [String],
      default: [],
    },

    // The original symptom keys as extracted (e.g. ['stomach_pain', 'nausea'])
    // Stored to avoid unreliable re-derivation from human-readable labels
    symptomKeys: {
      type: [String],
      default: [],
    },

    // Which symptom key the current question flow belongs to
    activeSymptomKey: {
      type: String,
      default: null,
    },

    // Index into the pending question for the active symptom
    questionFlowIndex: {
      type: Number,
      default: 0,
    },

    // The ID of the last question asked — used to correctly file the next answer
    lastAskedQuestionId: {
      type: String,
      default: null,
    },

    // The text of the last question asked — used by LLM path
    lastAskedQuestionText: {
      type: String,
      default: null,
    },

    // AI risk classification
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical', 'unknown'],
      default: 'unknown',
    },

    // Recommended department / specialty
    department: {
      type: String,
      trim: true,
      default: null,
    },

    // Plain-language summary for the doctor
    summary: {
      type: String,
      default: null,
    },

    // Structured clinical summary from LLM (JSON object)
    structuredSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Structured medical entities extracted by LLM
    medicalEntities: {
      type: medicalEntitiesSchema,
      default: () => ({}),
    },

    // Rich triage result with confidence + reasoning
    triageResult: {
      type: triageResultSchema,
      default: () => ({}),
    },

    // Which engine was used: 'llm' or 'rules'
    aiEngine: {
      type: String,
      enum: ['llm', 'rules', 'hybrid'],
      default: 'rules',
    },

    // Session lifecycle status (distinct from triageState)
    status: {
      type: String,
      enum: ['active', 'completed', 'reviewed', 'cancelled'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for user session history queries
sessionSchema.index({ userId: 1, createdAt: -1 });

const Session = mongoose.model('Session', sessionSchema);

module.exports = Session;
module.exports.TRIAGE_STATES = TRIAGE_STATES;
