/**
 * services/aiService.js — LLM-powered AI Service
 *
 * Provides four core AI capabilities:
 *   1. extractEntities   — Structured medical entity extraction
 *   2. getNextQuestion   — Dynamic follow-up question reasoning
 *   3. assessTriage      — Risk classification with confidence + reasoning
 *   4. generateSummary   — Physician-ready clinical summary
 *
 * Each function:
 *   - Uses the configured LLM provider via llmRouter
 *   - Returns a structured object
 *   - Throws on failure (caller applies fallback)
 *
 * Safety guardrails are enforced at the prompt level.
 * No function claims diagnosis or prescribes treatment.
 */

const llm = require('./llm/llmRouter');
const { parseLLMJson } = require('../utils/parseJson');

const extractionPrompt = require('../prompts/symptomExtractionPrompt');
const questionPrompt   = require('../prompts/questionPrompt');
const triagePrompt     = require('../prompts/triagePrompt');
const summaryPrompt    = require('../prompts/summaryPrompt');

// ─── 1. Medical Entity Extraction ─────────────────────────────────────────────

/**
 * Extract structured medical entities from a patient message using an LLM.
 *
 * @param {string} patientMessage
 * @returns {Promise<{
 *   symptoms: string[],
 *   duration: string|null,
 *   severity: string|null,
 *   medicalHistory: string[],
 *   medications: string[],
 *   allergies: string[],
 *   vitalSigns: object
 * }>}
 */
async function extractEntities(patientMessage) {
  const messages = [
    { role: 'system', content: extractionPrompt.buildSystemPrompt() },
    { role: 'user',   content: extractionPrompt.buildUserPrompt(patientMessage) },
  ];

  const raw = await llm.chat({ messages, temperature: 0.1, maxTokens: 800 });
  const parsed = parseLLMJson(raw);

  // Normalise — ensure all fields exist even if LLM omits some
  return {
    symptoms:       Array.isArray(parsed.symptoms)      ? parsed.symptoms      : [],
    duration:       parsed.duration       || null,
    severity:       parsed.severity       || null,
    medicalHistory: Array.isArray(parsed.medicalHistory) ? parsed.medicalHistory : [],
    medications:    Array.isArray(parsed.medications)   ? parsed.medications   : [],
    allergies:      Array.isArray(parsed.allergies)     ? parsed.allergies     : [],
    vitalSigns:     parsed.vitalSigns     || {},
  };
}

// ─── 2. Dynamic Question Reasoning ────────────────────────────────────────────

/**
 * Determine the single best follow-up question to ask next.
 * Returns null if the LLM decides assessment is ready.
 *
 * @param {object} params
 * @param {string[]} params.extractedSymptoms
 * @param {Array<{question: string, answer: string}>} params.answeredQuestions
 * @param {object}   params.entities
 * @param {string[]} params.askedQuestions — question texts already asked
 * @returns {Promise<string|null>} Question text, or null if ASSESSMENT_READY
 */
async function getNextQuestion({ extractedSymptoms, answeredQuestions, entities, askedQuestions }) {
  const messages = [
    { role: 'system', content: questionPrompt.buildSystemPrompt() },
    {
      role: 'user',
      content: questionPrompt.buildUserPrompt({
        extractedSymptoms,
        answeredQuestions,
        entities,
        askedQuestions,
      }),
    },
  ];

  const raw = await llm.chat({ messages, temperature: 0.4, maxTokens: 200 });
  const trimmed = raw.trim();

  if (trimmed === 'ASSESSMENT_READY') return null;

  // Strip any accidental numbering or bullet the LLM adds
  return trimmed.replace(/^[\d\.\-\*\s]+/, '').trim();
}

// ─── 3. Triage Risk Assessment ────────────────────────────────────────────────

/**
 * Generate a structured triage assessment with risk level, confidence,
 * department routing, and explainable reasoning.
 *
 * @param {object} params
 * @param {string[]} params.extractedSymptoms
 * @param {Array<{question: string, answer: string}>} params.answeredQuestions
 * @param {object}   params.entities
 * @param {object[]} params.messages — full conversation history
 * @returns {Promise<{
 *   riskLevel: string,
 *   confidence: number,
 *   department: string,
 *   urgency: string,
 *   reasoning: string[],
 *   redFlags: string[],
 *   suggestedFollowUp: string
 * }>}
 */
async function assessTriage({ extractedSymptoms, answeredQuestions, entities, messages }) {
  const llmMessages = [
    { role: 'system', content: triagePrompt.buildSystemPrompt() },
    {
      role: 'user',
      content: triagePrompt.buildUserPrompt({
        extractedSymptoms,
        answeredQuestions,
        entities,
        messages,
      }),
    },
  ];

  const raw = await llm.chat({ messages: llmMessages, temperature: 0.2, maxTokens: 1000 });
  const parsed = parseLLMJson(raw);

  // Validate and normalise the response
  const validRiskLevels = ['low', 'medium', 'high', 'critical'];
  const riskLevel = validRiskLevels.includes(parsed.riskLevel?.toLowerCase())
    ? parsed.riskLevel.toLowerCase()
    : 'unknown';

  return {
    riskLevel,
    confidence:        typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
    department:        parsed.department        || 'General Practice',
    urgency:           parsed.urgency           || 'Please consult a healthcare provider.',
    reasoning:         Array.isArray(parsed.reasoning)   ? parsed.reasoning   : [],
    redFlags:          Array.isArray(parsed.redFlags)    ? parsed.redFlags    : [],
    suggestedFollowUp: parsed.suggestedFollowUp || 'Follow up with your healthcare provider.',
  };
}

// ─── 4. Clinical Summary Generation ──────────────────────────────────────────

/**
 * Generate a structured physician-ready clinical summary.
 *
 * @param {object} params
 * @param {string[]} params.extractedSymptoms
 * @param {Array<{question: string, answer: string}>} params.answeredQuestions
 * @param {object}   params.entities
 * @param {object}   params.triageResult — output from assessTriage
 * @param {object[]} params.messages
 * @returns {Promise<object>} Structured clinical summary object
 */
async function generateSummary({ extractedSymptoms, answeredQuestions, entities, triageResult, messages }) {
  const llmMessages = [
    { role: 'system', content: summaryPrompt.buildSystemPrompt() },
    {
      role: 'user',
      content: summaryPrompt.buildUserPrompt({
        extractedSymptoms,
        answeredQuestions,
        entities,
        triageResult,
        messages,
      }),
    },
  ];

  const raw = await llm.chat({ messages: llmMessages, temperature: 0.2, maxTokens: 1500 });
  const parsed = parseLLMJson(raw);

  // Ensure disclaimer is always present (safety guardrail)
  if (!parsed.disclaimer) {
    parsed.disclaimer =
      'This summary was generated by an AI intake assistant and represents a triage recommendation only. ' +
      'Clinical assessment by a qualified healthcare professional is required for diagnosis and treatment.';
  }

  return parsed;
}

// ─── Provider Status ──────────────────────────────────────────────────────────

/**
 * Check whether an LLM provider is available.
 * @returns {boolean}
 */
function isAvailable() {
  return llm.isLLMAvailable();
}

/**
 * Get the name of the active provider.
 * @returns {string}
 */
function getProviderName() {
  return llm.getProviderName();
}

module.exports = {
  extractEntities,
  getNextQuestion,
  assessTriage,
  generateSummary,
  isAvailable,
  getProviderName,
};
