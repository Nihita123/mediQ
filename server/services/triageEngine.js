/**
 * services/triageEngine.js — Hybrid AI Triage Orchestrator (v2)
 *
 * Architecture:
 *   PRIMARY   → LLM-powered reasoning (aiService.js)
 *   FALLBACK  → Rule-based system (symptomExtractor, questionEngine, triageAssessor)
 *
 * The fallback engages automatically if:
 *   - No LLM provider is configured
 *   - The LLM call throws any error
 *   - The LLM returns unparseable output
 *
 * State machine (unchanged):
 *   STARTED → SYMPTOM_COLLECTION → FOLLOW_UP_QUESTIONS → ASSESSMENT_READY → SUMMARY_READY
 *
 * Public API:
 *   processMessage(session, userText) → { reply }   [async in LLM mode]
 */

// ─── LLM Layer ────────────────────────────────────────────────────────────────
const aiService = require('./aiService');

// ─── Rule-based Fallback Layer ────────────────────────────────────────────────
const { extractSymptoms, mergeSymptoms }               = require('./symptomExtractor');
const { getNextQuestion, countRemainingRequired }       = require('./questionEngine');
const { assessRisk, generateSummary: rulesSummary }     = require('./triageAssessor');

// ─── State Constants ──────────────────────────────────────────────────────────
const STATE = {
  STARTED:             'STARTED',
  SYMPTOM_COLLECTION:  'SYMPTOM_COLLECTION',
  FOLLOW_UP_QUESTIONS: 'FOLLOW_UP_QUESTIONS',
  ASSESSMENT_READY:    'ASSESSMENT_READY',
  SUMMARY_READY:       'SUMMARY_READY',
};

// After this many Q&A pairs, force assessment even if LLM wants more questions
const MAX_FOLLOW_UP_QUESTIONS = 8;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAnsweredIds(answeredQuestions) {
  return answeredQuestions.map((a) => a.questionId);
}

function getSymptomKeys(session) {
  // 1. Use the authoritatively stored keys if available (set on first extraction)
  if (session.symptomKeys && session.symptomKeys.length > 0) {
    return session.symptomKeys;
  }

  // 2. Fall back to keys referenced in answered questions
  const fromAnswered = session.answeredQuestions
    .map((a) => a.symptomKey)
    .filter((k) => k && k !== 'llm' && k !== 'unknown');

  if (fromAnswered.length > 0) {
    return Array.from(new Set(fromAnswered));
  }

  // 3. Last resort: derive from labels (unreliable — only reached for legacy sessions)
  return session.extractedSymptoms.map((label) =>
    label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  );
}

/**
 * Format session state as a short log line for console output.
 */
function logState(session, engine, action) {
  console.log(`[Triage][${engine}] state=${session.triageState} action=${action}`);
}

// ─── Patient-facing Urgency Messages ─────────────────────────────────────────
const URGENCY_MESSAGES = {
  critical: '🚨 Based on your symptoms, please **seek emergency care immediately** or call 911.',
  high:     '⚠️ Your symptoms suggest you should be seen **urgently today**. Please visit an urgent care centre or emergency department.',
  medium:   '📋 Your symptoms should be evaluated by a doctor. Please book an appointment or visit urgent care within 24–48 hours.',
  low:      '✅ Your symptoms appear suitable for a routine appointment with your doctor.',
  unknown:  '📋 Please consult a healthcare provider for a proper evaluation.',
};

// ═══════════════════════════════════════════════════════════════════════════════
// LLM PATH
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handle SYMPTOM_COLLECTION state using the LLM extractor.
 */
async function llmHandleSymptomCollection(session, userText) {
  const entities = await aiService.extractEntities(userText);

  // Merge extracted symptoms into session
  if (entities.symptoms.length > 0) {
    session.extractedSymptoms = mergeSymptoms(session.extractedSymptoms, entities.symptoms);
    // Store the authoritative keys derived from the LLM-extracted symptom labels
    const { extractSymptoms: ruleExtract } = require('./symptomExtractor');
    const existingKeys = session.symptomKeys || [];
    const newKeys = entities.symptoms.flatMap(s => ruleExtract(s).symptomKeys);
    session.symptomKeys = Array.from(new Set([...existingKeys, ...newKeys]));
  }

  // Store structured entities on the session
  session.medicalEntities = {
    symptoms:       entities.symptoms,
    duration:       entities.duration,
    severity:       entities.severity,
    medicalHistory: entities.medicalHistory,
    medications:    entities.medications,
    allergies:      entities.allergies,
    vitalSigns:     entities.vitalSigns,
  };

  // If nothing was extracted, ask the patient to be more specific
  if (session.extractedSymptoms.length === 0) {
    return {
      reply:
        "I want to make sure I understand your symptoms clearly. Could you describe what you're experiencing in a bit more detail? For example: 'I have chest pain and feel short of breath.'",
    };
  }

  session.triageState = STATE.FOLLOW_UP_QUESTIONS;
  session.aiEngine    = 'llm';

  // Get the first follow-up question
  const question = await aiService.getNextQuestion({
    extractedSymptoms: session.extractedSymptoms,
    answeredQuestions:  session.answeredQuestions,
    entities:           session.medicalEntities,
    askedQuestions:     session.answeredQuestions.map((q) => q.question),
  });

  if (!question) {
    return llmHandleAssessmentReady(session);
  }

  // Store so the first answer is filed against the correct question
  session.lastAskedQuestionId   = `llm_q_1`;
  session.lastAskedQuestionText = question;

  const bulletList = session.extractedSymptoms.map((s) => `• ${s}`).join('\n');
  return {
    reply: `I've noted the following:\n${bulletList}\n\nI have a few follow-up questions.\n\n${question}`,
  };
}

/**
 * Handle FOLLOW_UP_QUESTIONS state using LLM dynamic questioning.
 */
async function llmHandleFollowUpQuestions(session, userText) {
  // ── Step 1: File the answer to the LAST ASKED question ────────────────────
  // Use lastAskedQuestionText (stored when we sent the question) so we always
  // file the answer against the right question, not whatever the LLM picks next.
  const lastQuestion = session.lastAskedQuestionText
    || ([...session.messages].filter((m) => m.role === 'assistant').pop()?.content)
    || 'Follow-up question';

  session.answeredQuestions.push({
    questionId: `llm_q_${session.answeredQuestions.length + 1}`,
    question:   lastQuestion,
    answer:     userText.trim(),
    symptomKey: 'llm',
  });

  // Clear the pointer
  session.lastAskedQuestionId   = null;
  session.lastAskedQuestionText = null;

  // Also check for new symptoms in the answer
  const { symptoms: newSymptoms } = extractSymptoms(userText);
  if (newSymptoms.length > 0) {
    session.extractedSymptoms = mergeSymptoms(session.extractedSymptoms, newSymptoms);
  }

  // Check LLM extraction on the answer for entities too
  try {
    const answerEntities = await aiService.extractEntities(userText);
    if (answerEntities.symptoms.length > 0) {
      session.extractedSymptoms = mergeSymptoms(session.extractedSymptoms, answerEntities.symptoms);
    }
    // Merge into medicalEntities
    const existing = session.medicalEntities || {};
    session.medicalEntities = {
      symptoms:       mergeSymptoms(existing.symptoms || [], answerEntities.symptoms),
      duration:       existing.duration       || answerEntities.duration,
      severity:       existing.severity       || answerEntities.severity,
      medicalHistory: mergeSymptoms(existing.medicalHistory || [], answerEntities.medicalHistory),
      medications:    mergeSymptoms(existing.medications    || [], answerEntities.medications),
      allergies:      mergeSymptoms(existing.allergies      || [], answerEntities.allergies),
      vitalSigns:     { ...(existing.vitalSigns || {}), ...(answerEntities.vitalSigns || {}) },
    };
  } catch {
    // Non-fatal — continue with existing entities
  }

  // Force assessment if we've asked the maximum number of questions
  if (session.answeredQuestions.length >= MAX_FOLLOW_UP_QUESTIONS) {
    return llmHandleAssessmentReady(session);
  }

  // Ask LLM for next question
  const nextQuestion = await aiService.getNextQuestion({
    extractedSymptoms: session.extractedSymptoms,
    answeredQuestions:  session.answeredQuestions,
    entities:           session.medicalEntities || {},
    askedQuestions:     session.answeredQuestions.map((q) => q.question),
  });

  if (!nextQuestion) {
    return llmHandleAssessmentReady(session);
  }

  // Store so the next answer is filed against the correct question
  session.lastAskedQuestionId   = `llm_q_${session.answeredQuestions.length + 1}`;
  session.lastAskedQuestionText = nextQuestion;

  return { reply: nextQuestion };
}

/**
 * Perform LLM-powered triage assessment and generate structured summary.
 */
async function llmHandleAssessmentReady(session) {
  session.triageState = STATE.ASSESSMENT_READY;

  // Run triage assessment
  const triageResult = await aiService.assessTriage({
    extractedSymptoms: session.extractedSymptoms,
    answeredQuestions:  session.answeredQuestions,
    entities:           session.medicalEntities || {},
    messages:           session.messages,
  });

  session.riskLevel    = triageResult.riskLevel;
  session.department   = triageResult.department;
  session.triageResult = { ...triageResult, generatedBy: 'llm' };

  // Generate structured clinical summary
  const structuredSummary = await aiService.generateSummary({
    extractedSymptoms: session.extractedSymptoms,
    answeredQuestions:  session.answeredQuestions,
    entities:           session.medicalEntities || {},
    triageResult,
    messages:           session.messages,
  });

  session.structuredSummary = structuredSummary;
  session.summary = structuredSummary.historyOfPresentIllness
    || JSON.stringify(structuredSummary, null, 2);

  session.triageState = STATE.SUMMARY_READY;
  session.status      = 'completed';
  session.aiEngine    = 'llm';

  const urgencyMsg = triageResult.urgency || URGENCY_MESSAGES[triageResult.riskLevel] || URGENCY_MESSAGES.unknown;
  const confidenceText = triageResult.confidence
    ? ` (confidence: ${Math.round(triageResult.confidence * 100)}%)`
    : '';

  const reply =
    `I've completed your intake assessment.\n\n` +
    `**Symptoms noted:** ${session.extractedSymptoms.join(', ')}\n` +
    `**Risk level:** ${triageResult.riskLevel.toUpperCase()}${confidenceText}\n` +
    `**Recommended department:** ${triageResult.department}\n\n` +
    `${urgencyMsg}\n\n` +
    `A detailed clinical report has been prepared for your healthcare provider.`;

  return { reply };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RULE-BASED FALLBACK PATH  (unchanged logic from v1)
// ═══════════════════════════════════════════════════════════════════════════════

function rulesHandleStarted(session) {
  session.triageState = STATE.SYMPTOM_COLLECTION;
  session.aiEngine    = 'rules';
  return {
    reply: "Hello! I'm MediQ, your AI health intake assistant. I'm here to help gather information about your symptoms so your care team is better prepared.\n\nPlease describe what you're experiencing today.",
  };
}

function rulesHandleSymptomCollection(session, userText) {
  const { symptoms, symptomKeys } = extractSymptoms(userText);

  if (symptoms.length === 0) {
    return {
      reply:
        "I want to make sure I understand your symptoms correctly. Could you describe how you're feeling in more detail? For example: 'I have chest pain and feel dizzy.'",
    };
  }

  session.extractedSymptoms = mergeSymptoms(session.extractedSymptoms, symptoms);

  // Store the authoritative keys so getSymptomKeys never re-derives from labels
  const existingKeys = session.symptomKeys || [];
  session.symptomKeys = Array.from(new Set([...existingKeys, ...symptomKeys]));

  session.triageState = STATE.FOLLOW_UP_QUESTIONS;
  session.aiEngine    = 'rules';

  const bulletList = symptoms.map((s) => `• ${s}`).join('\n');
  const nextQ = getNextQuestion(session.symptomKeys, getAnsweredIds(session.answeredQuestions));

  if (!nextQ) return rulesHandleAssessmentReady(session);

  // Remember which question we just asked so the next answer is filed correctly
  session.lastAskedQuestionId   = nextQ.id;
  session.lastAskedQuestionText = nextQ.text;

  return {
    reply: `I've noted:\n${bulletList}\n\nI have a few follow-up questions.\n\n${nextQ.text}`,
  };
}

function rulesHandleFollowUpQuestions(session, userText) {
  const symptomKeys = getSymptomKeys(session);

  // ── Step 1: File the answer to the LAST ASKED question ────────────────────
  // We use lastAskedQuestionId (set when we asked the question) so we always
  // record the answer against the correct question, regardless of queue state.
  if (session.lastAskedQuestionId) {
    const alreadyAnswered = session.answeredQuestions.some(
      (a) => a.questionId === session.lastAskedQuestionId
    );

    if (!alreadyAnswered) {
      // Find the question definition to get its symptomKey
      const { getQuestionById } = require('./questionEngine');
      const qDef = getQuestionById(session.lastAskedQuestionId);

      session.answeredQuestions.push({
        questionId: session.lastAskedQuestionId,
        question:   session.lastAskedQuestionText || session.lastAskedQuestionId,
        answer:     userText.trim(),
        symptomKey: qDef?.symptomKey || symptomKeys[0] || 'unknown',
      });
    }

    // Clear the pointer — it's been consumed
    session.lastAskedQuestionId   = null;
    session.lastAskedQuestionText = null;
  }

  // Also scan the answer for any newly mentioned symptoms
  const { symptoms: newSymptoms } = extractSymptoms(userText);
  if (newSymptoms.length > 0) {
    session.extractedSymptoms = mergeSymptoms(session.extractedSymptoms, newSymptoms);
  }

  // ── Step 2: Find the next unanswered question ──────────────────────────────
  const updatedAnsweredIds = getAnsweredIds(session.answeredQuestions);
  const updatedSymptomKeys = getSymptomKeys(session);
  const nextQuestion       = getNextQuestion(updatedSymptomKeys, updatedAnsweredIds);

  // Done when no questions remain at all
  if (!nextQuestion) {
    return rulesHandleAssessmentReady(session);
  }

  // Store what we're about to ask so the next answer can be filed correctly
  session.lastAskedQuestionId   = nextQuestion.id;
  session.lastAskedQuestionText = nextQuestion.text;

  return { reply: nextQuestion.text };
}

function rulesHandleAssessmentReady(session) {
  const symptomKeys = getSymptomKeys(session);
  const { riskLevel, department, reason } = assessRisk(symptomKeys, session.answeredQuestions);

  session.riskLevel   = riskLevel;
  session.department  = department;
  session.triageResult = {
    riskLevel,
    confidence:        0,
    department,
    urgency:           URGENCY_MESSAGES[riskLevel] || URGENCY_MESSAGES.unknown,
    reasoning:         [reason],
    redFlags:          [],
    suggestedFollowUp: 'Follow up with your healthcare provider.',
    generatedBy:       'rules',
  };

  const summary = rulesSummary(session.toObject ? session.toObject() : session);
  session.summary     = summary;
  session.triageState = STATE.SUMMARY_READY;
  session.status      = 'completed';
  session.aiEngine    = 'rules';

  const reply =
    `I've completed your intake assessment.\n\n` +
    `**Symptoms noted:** ${session.extractedSymptoms.join(', ')}\n` +
    `**Recommended department:** ${department}\n` +
    `**Assessment:** ${reason}\n\n` +
    `${URGENCY_MESSAGES[riskLevel] || URGENCY_MESSAGES.unknown}\n\n` +
    `A detailed report has been prepared for your healthcare provider.`;

  return { reply };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Process one user message through the triage state machine.
 *
 * Tries LLM path first, falls back to rules on any error.
 *
 * @param {object} session  — Mongoose session document (mutated in place)
 * @param {string} userText — Raw patient message
 * @returns {Promise<{ reply: string }>}
 */
async function processMessage(session, userText) {
  const useLLM = aiService.isAvailable();

  // ── Completed sessions ─────────────────────────────────────────────────────
  if (
    session.triageState === STATE.ASSESSMENT_READY ||
    session.triageState === STATE.SUMMARY_READY
  ) {
    return {
      reply:
        'This session has been completed. Your intake summary is ready for your healthcare provider. If you have new symptoms, please start a new triage session.',
    };
  }

  // ── STARTED ────────────────────────────────────────────────────────────────
  if (session.triageState === STATE.STARTED) {
    session.triageState = STATE.SYMPTOM_COLLECTION;
    session.aiEngine    = useLLM ? 'llm' : 'rules';
    return {
      reply:
        "Hello! I'm MediQ, your AI health intake assistant. I'm here to help gather information about your symptoms so your care team is better prepared.\n\nPlease describe what you're experiencing today — what symptoms or concerns brought you in?",
    };
  }

  // ── LLM PATH ───────────────────────────────────────────────────────────────
  if (useLLM) {
    try {
      if (session.triageState === STATE.SYMPTOM_COLLECTION) {
        logState(session, 'LLM', 'symptom_collection');
        return await llmHandleSymptomCollection(session, userText);
      }
      if (session.triageState === STATE.FOLLOW_UP_QUESTIONS) {
        logState(session, 'LLM', 'follow_up');
        return await llmHandleFollowUpQuestions(session, userText);
      }
    } catch (err) {
      console.error(`[Triage][LLM] Error — falling back to rules: ${err.message}`);
      // Fall through to rules
    }
  }

  // ── RULES FALLBACK ─────────────────────────────────────────────────────────
  logState(session, 'RULES', session.triageState);

  if (session.triageState === STATE.SYMPTOM_COLLECTION) {
    return rulesHandleSymptomCollection(session, userText);
  }
  if (session.triageState === STATE.FOLLOW_UP_QUESTIONS) {
    return rulesHandleFollowUpQuestions(session, userText);
  }

  // Unknown state — reset gracefully
  session.triageState = STATE.SYMPTOM_COLLECTION;
  return rulesHandleStarted(session);
}

module.exports = { processMessage, STATE };
