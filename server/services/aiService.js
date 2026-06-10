/**
 * services/aiService.js  (v3)
 *
 * LLM → structured JSON architecture.
 * Every function returns a validated plain object — NEVER raw text.
 * The triage engine uses these objects to build responses, not the LLM output directly.
 */

const llm = require('./llm/llmRouter');
const { parseLLMJson } = require('../utils/parseJson');

const extractionPrompt = require('../prompts/symptomExtractionPrompt');
const questionPrompt   = require('../prompts/questionPrompt');
const triagePrompt     = require('../prompts/triagePrompt');
const summaryPrompt    = require('../prompts/summaryPrompt');

// ─── 1. Clinical Entity Extraction ────────────────────────────────────────────

/**
 * Extract a rich clinical context object from a patient message.
 * Merges with existing context to build a cumulative picture.
 *
 * @param {string} patientMessage
 * @param {object|null} existingContext — current session clinicalContext
 * @returns {Promise<object>} clinicalContext
 */
async function extractEntities(patientMessage, existingContext = null) {
  const messages = [
    { role: 'system', content: extractionPrompt.buildSystemPrompt() },
    { role: 'user',   content: extractionPrompt.buildUserPrompt(patientMessage, existingContext) },
  ];

  const raw    = await llm.chat({ messages, temperature: 0.1, maxTokens: 1000 });
  const parsed = parseLLMJson(raw);

  // Normalise — guarantee all fields exist
  return {
    primarySymptom:       parsed.primarySymptom       || null,
    bodyPart:             parsed.bodyPart              || null,
    symptoms:             Array.isArray(parsed.symptoms)             ? parsed.symptoms             : [],
    duration:             parsed.duration             || null,
    severity:             parsed.severity             || null,
    mechanismOfInjury:    parsed.mechanismOfInjury    || null,
    recentTrauma:         parsed.recentTrauma === true,
    functionalLimitations: Array.isArray(parsed.functionalLimitations) ? parsed.functionalLimitations : [],
    associatedSymptoms:   Array.isArray(parsed.associatedSymptoms)   ? parsed.associatedSymptoms   : [],
    medicalHistory:       Array.isArray(parsed.medicalHistory)       ? parsed.medicalHistory       : [],
    medications:          Array.isArray(parsed.medications)          ? parsed.medications          : [],
    allergies:            Array.isArray(parsed.allergies)            ? parsed.allergies            : [],
    vitalSigns:           parsed.vitalSigns           || {},
    riskFactors:          Array.isArray(parsed.riskFactors)          ? parsed.riskFactors          : [],
    missingCriticalInfo:  Array.isArray(parsed.missingCriticalInfo)  ? parsed.missingCriticalInfo  : [],
  };
}

// ─── 2. Question Decision ─────────────────────────────────────────────────────

/**
 * Decide what to ask next — returns a structured JSON decision object.
 * The caller builds the actual reply text using clinicalReasoner.buildReply().
 *
 * @param {object} params
 * @param {object}   params.clinicalContext
 * @param {object[]} params.answeredQuestions
 * @param {object[]} params.conversationHistory
 * @param {string}   params.lastPatientMessage
 * @returns {Promise<{
 *   decision: 'ask_question'|'assessment_ready',
 *   questionId: string,
 *   questionText: string,
 *   clinicalReason: string,
 *   urgencySignal: string,
 *   contextAcknowledgement: string|null
 * }>}
 */
async function getNextQuestion({ clinicalContext, answeredQuestions, conversationHistory, lastPatientMessage }) {
  const messages = [
    { role: 'system', content: questionPrompt.buildSystemPrompt() },
    {
      role: 'user',
      content: questionPrompt.buildUserPrompt({
        clinicalContext,
        answeredQuestions,
        conversationHistory,
        lastPatientMessage,
      }),
    },
  ];

  const raw    = await llm.chat({ messages, temperature: 0.3, maxTokens: 400 });
  const parsed = parseLLMJson(raw);

  // Validate decision field
  const validDecisions = ['ask_question', 'assessment_ready'];
  if (!validDecisions.includes(parsed.decision)) {
    parsed.decision = 'ask_question';
  }

  return {
    decision:               parsed.decision,
    questionId:             parsed.questionId             || `q_${Date.now()}`,
    questionText:           parsed.questionText           || null,
    clinicalReason:         parsed.clinicalReason         || '',
    urgencySignal:          parsed.urgencySignal          || 'none',
    contextAcknowledgement: parsed.contextAcknowledgement || null,
  };
}

// ─── 3. Triage Assessment ─────────────────────────────────────────────────────

/**
 * Generate structured triage assessment with risk, confidence, and reasoning.
 */
async function assessTriage({ extractedSymptoms, answeredQuestions, entities, messages }) {
  const llmMessages = [
    { role: 'system', content: triagePrompt.buildSystemPrompt() },
    {
      role: 'user',
      content: triagePrompt.buildUserPrompt({ extractedSymptoms, answeredQuestions, entities, messages }),
    },
  ];

  const raw    = await llm.chat({ messages: llmMessages, temperature: 0.2, maxTokens: 1000 });
  const parsed = parseLLMJson(raw);

  const validRiskLevels = ['low', 'medium', 'high', 'critical'];
  const riskLevel = validRiskLevels.includes(parsed.riskLevel?.toLowerCase())
    ? parsed.riskLevel.toLowerCase()
    : 'unknown';

  return {
    riskLevel,
    confidence:        typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
    department:        parsed.department        || 'General Practice',
    urgency:           parsed.urgency           || 'Please consult a healthcare provider.',
    reasoning:         Array.isArray(parsed.reasoning)  ? parsed.reasoning  : [],
    redFlags:          Array.isArray(parsed.redFlags)   ? parsed.redFlags   : [],
    suggestedFollowUp: parsed.suggestedFollowUp || 'Follow up with your healthcare provider.',
  };
}

// ─── 4. Clinical Summary ──────────────────────────────────────────────────────

/**
 * Generate structured physician-ready clinical summary.
 */
async function generateSummary({ extractedSymptoms, answeredQuestions, entities, triageResult, messages }) {
  const llmMessages = [
    { role: 'system', content: summaryPrompt.buildSystemPrompt() },
    {
      role: 'user',
      content: summaryPrompt.buildUserPrompt({ extractedSymptoms, answeredQuestions, entities, triageResult, messages }),
    },
  ];

  const raw    = await llm.chat({ messages: llmMessages, temperature: 0.2, maxTokens: 1500 });
  const parsed = parseLLMJson(raw);

  if (!parsed.disclaimer) {
    parsed.disclaimer = 'This summary was generated by an AI intake assistant and represents a triage recommendation only. Clinical assessment by a qualified healthcare professional is required for diagnosis and treatment.';
  }

  return parsed;
}

// ─── Provider Status ──────────────────────────────────────────────────────────

function isAvailable()    { return llm.isLLMAvailable(); }
function getProviderName() { return llm.getProviderName(); }

module.exports = {
  extractEntities,
  getNextQuestion,
  assessTriage,
  generateSummary,
  isAvailable,
  getProviderName,
};
