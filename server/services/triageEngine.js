/**
 * services/triageEngine.js  (v3)
 *
 * Architecture: LLM → structured JSON → reasoning engine → reply
 *
 * Flow:
 *   1. LLM extracts rich clinicalContext from patient text
 *   2. Reasoning engine (clinicalReasoner) calculates interim risk,
 *      detects trauma, determines what's missing
 *   3. LLM decides WHAT to ask next (returns JSON decision, not text)
 *   4. Reasoning engine builds the actual patient-facing reply
 *
 * Rule-based fallback is used when no LLM is configured or LLM fails.
 * Fallback uses the expanded symptomExtractor + clinicalReasoner for
 * trauma detection and semantic understanding.
 */

const aiService      = require('./aiService');
const clinicalReasoner = require('./reasoning/clinicalReasoner');

const { extractSymptoms, extractClinicalContext, mergeSymptoms } = require('./symptomExtractor');
const { getNextQuestion: rulesGetNextQuestion, getQuestionById } = require('./questionEngine');
const { assessRisk, generateSummary: rulesSummary }              = require('./triageAssessor');

const STATE = {
  STARTED:             'STARTED',
  SYMPTOM_COLLECTION:  'SYMPTOM_COLLECTION',
  FOLLOW_UP_QUESTIONS: 'FOLLOW_UP_QUESTIONS',
  ASSESSMENT_READY:    'ASSESSMENT_READY',
  SUMMARY_READY:       'SUMMARY_READY',
};

const MAX_FOLLOW_UP_QUESTIONS = 8;

// ─── Shared Helpers ───────────────────────────────────────────────────────────

function getAnsweredIds(answeredQuestions) {
  return answeredQuestions.map((a) => a.questionId);
}

function getSymptomKeys(session) {
  if (session.symptomKeys?.length > 0) return session.symptomKeys;

  const fromAnswered = session.answeredQuestions
    .map((a) => a.symptomKey)
    .filter((k) => k && k !== 'llm' && k !== 'unknown');
  if (fromAnswered.length > 0) return Array.from(new Set(fromAnswered));

  return session.extractedSymptoms.map((l) =>
    l.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  );
}

function logState(session, engine, action) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Triage][${engine}] state=${session.triageState} action=${action}`);
  }
}

const URGENCY_MESSAGES = {
  critical: '🚨 Based on your symptoms, please **seek emergency care immediately** or call 911.',
  high:     '⚠️ Your symptoms suggest you should be seen **urgently today**. Please visit an urgent care centre or emergency department.',
  medium:   '📋 Your symptoms should be evaluated by a doctor. Please book an appointment or visit urgent care within 24–48 hours.',
  low:      '✅ Your symptoms appear suitable for a routine appointment with your doctor.',
  unknown:  '📋 Please consult a healthcare provider for a proper evaluation.',
};

/**
 * Merge new clinical context into the session's existing context.
 * Preserves all previously collected data.
 */
function mergeClinicalContext(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;

  return {
    primarySymptom:        incoming.primarySymptom        || existing.primarySymptom,
    bodyPart:              incoming.bodyPart               || existing.bodyPart,
    symptoms:              mergeSymptoms(existing.symptoms || [], incoming.symptoms || []),
    duration:              existing.duration               || incoming.duration,
    severity:              existing.severity               || incoming.severity,
    mechanismOfInjury:     existing.mechanismOfInjury      || incoming.mechanismOfInjury,
    recentTrauma:          existing.recentTrauma           || incoming.recentTrauma === true,
    functionalLimitations: mergeSymptoms(existing.functionalLimitations || [], incoming.functionalLimitations || []),
    associatedSymptoms:    mergeSymptoms(existing.associatedSymptoms || [], incoming.associatedSymptoms || []),
    medicalHistory:        mergeSymptoms(existing.medicalHistory || [], incoming.medicalHistory || []),
    medications:           mergeSymptoms(existing.medications || [], incoming.medications || []),
    allergies:             mergeSymptoms(existing.allergies || [], incoming.allergies || []),
    vitalSigns:            { ...(existing.vitalSigns || {}), ...(incoming.vitalSigns || {}) },
    riskFactors:           mergeSymptoms(existing.riskFactors || [], incoming.riskFactors || []),
    missingCriticalInfo:   incoming.missingCriticalInfo    || existing.missingCriticalInfo || [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LLM PATH  (v3 — structured JSON architecture)
// ═══════════════════════════════════════════════════════════════════════════════

async function llmHandleSymptomCollection(session, userText) {
  // 1. Extract rich clinical context from patient text
  const newContext = await aiService.extractEntities(userText, session.clinicalContext);
  session.clinicalContext = mergeClinicalContext(session.clinicalContext, newContext);

  // 2. Update extractedSymptoms + symptomKeys for the rules engine / UI
  const allSymptomLabels = [
    ...(newContext.symptoms || []),
    ...(newContext.primarySymptom ? [newContext.primarySymptom] : []),
  ];
  if (allSymptomLabels.length > 0) {
    session.extractedSymptoms = mergeSymptoms(session.extractedSymptoms, allSymptomLabels);
    // Map to rule engine keys as well (for fallback routing)
    const newKeys = allSymptomLabels.flatMap((s) => extractSymptoms(s).symptomKeys);
    session.symptomKeys = Array.from(new Set([...(session.symptomKeys || []), ...newKeys]));
  }

  // 3. Update interim risk
  session.interimRiskLevel = clinicalReasoner.calculateInterimRisk(session.clinicalContext);

  if (session.extractedSymptoms.length === 0 && !session.clinicalContext.primarySymptom) {
    // Nothing recognisable — ask patient to elaborate with context
    return {
      reply: "I want to make sure I understand correctly. Could you describe what you're experiencing? For example: 'I fell and my ankle is hurting' or 'I have chest pain and shortness of breath.'",
    };
  }

  session.triageState = STATE.FOLLOW_UP_QUESTIONS;
  session.aiEngine    = 'llm';

  // 4. Get LLM's structured question decision
  const decision = await aiService.getNextQuestion({
    clinicalContext:     session.clinicalContext,
    answeredQuestions:   session.answeredQuestions,
    conversationHistory: session.messages,
    lastPatientMessage:  userText,
  });

  if (decision.decision === 'assessment_ready') {
    return llmHandleAssessmentReady(session);
  }

  // 5. Store the question pointer
  session.lastAskedQuestionId   = decision.questionId;
  session.lastAskedQuestionText = decision.questionText;

  // 6. Build contextually aware reply
  const reply = clinicalReasoner.buildFirstResponse(
    session.clinicalContext,
    decision.questionText,
    session.extractedSymptoms.slice(0, 3)
  );

  return { reply };
}

async function llmHandleFollowUpQuestions(session, userText) {
  // 1. File the answer to the LAST ASKED question
  if (session.lastAskedQuestionId) {
    const alreadyAnswered = session.answeredQuestions.some(
      (a) => a.questionId === session.lastAskedQuestionId
    );
    if (!alreadyAnswered) {
      session.answeredQuestions.push({
        questionId: session.lastAskedQuestionId,
        question:   session.lastAskedQuestionText || session.lastAskedQuestionId,
        answer:     userText.trim(),
        symptomKey: 'llm',
      });
    }
    session.lastAskedQuestionId   = null;
    session.lastAskedQuestionText = null;
  }

  // 2. Re-extract context from the answer to pick up NEW information
  try {
    const answerContext = await aiService.extractEntities(userText, session.clinicalContext);
    session.clinicalContext = mergeClinicalContext(session.clinicalContext, answerContext);

    // Merge any newly extracted symptom labels
    const newLabels = [...(answerContext.symptoms || [])];
    if (newLabels.length > 0) {
      session.extractedSymptoms = mergeSymptoms(session.extractedSymptoms, newLabels);
    }
  } catch {
    // Non-fatal — continue with existing context
  }

  // 3. Re-calculate interim risk after every answer
  session.interimRiskLevel = clinicalReasoner.calculateInterimRisk(session.clinicalContext);

  // 4. Cap at max questions
  if (session.answeredQuestions.length >= MAX_FOLLOW_UP_QUESTIONS) {
    return llmHandleAssessmentReady(session);
  }

  // 5. Get LLM's next structured question decision
  const decision = await aiService.getNextQuestion({
    clinicalContext:     session.clinicalContext,
    answeredQuestions:   session.answeredQuestions,
    conversationHistory: session.messages,
    lastPatientMessage:  userText,
  });

  if (decision.decision === 'assessment_ready') {
    return llmHandleAssessmentReady(session);
  }

  // 6. Store and build reply
  session.lastAskedQuestionId   = decision.questionId;
  session.lastAskedQuestionText = decision.questionText;

  const reply = clinicalReasoner.buildReply(decision, session.clinicalContext, userText);
  return { reply };
}

async function llmHandleAssessmentReady(session) {
  session.triageState = STATE.ASSESSMENT_READY;

  // Use clinicalReasoner for initial department routing
  const { department: routedDept, riskLevel: routedRisk } =
    clinicalReasoner.routeDepartment(session.clinicalContext);

  // Run full LLM triage for confidence scoring + reasoning
  const triageResult = await aiService.assessTriage({
    extractedSymptoms: session.extractedSymptoms,
    answeredQuestions:  session.answeredQuestions,
    entities:           session.clinicalContext || {},
    messages:           session.messages,
  });

  // LLM result takes precedence; use routing as fallback
  session.riskLevel   = triageResult.riskLevel !== 'unknown' ? triageResult.riskLevel : routedRisk;
  session.department  = triageResult.department || routedDept;
  session.triageResult = { ...triageResult, generatedBy: 'llm' };

  const structuredSummary = await aiService.generateSummary({
    extractedSymptoms: session.extractedSymptoms,
    answeredQuestions:  session.answeredQuestions,
    entities:           session.clinicalContext || {},
    triageResult,
    messages:           session.messages,
  });

  session.structuredSummary = structuredSummary;
  session.summary = structuredSummary.historyOfPresentIllness
    || JSON.stringify(structuredSummary, null, 2);

  session.triageState = STATE.SUMMARY_READY;
  session.status      = 'completed';
  session.aiEngine    = 'llm';

  const urgencyMsg = triageResult.urgency || URGENCY_MESSAGES[session.riskLevel] || URGENCY_MESSAGES.unknown;
  const pct = triageResult.confidence ? ` (${Math.round(triageResult.confidence * 100)}% confidence)` : '';

  return {
    reply:
      `I've completed your intake assessment.\n\n` +
      `**Symptoms noted:** ${session.extractedSymptoms.join(', ')}\n` +
      `**Risk level:** ${session.riskLevel.toUpperCase()}${pct}\n` +
      `**Recommended department:** ${session.department}\n\n` +
      `${urgencyMsg}\n\n` +
      `A detailed clinical report has been prepared for your healthcare provider.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RULE-BASED FALLBACK PATH  (v3 — uses clinicalReasoner + expanded extractor)
// ═══════════════════════════════════════════════════════════════════════════════

function rulesHandleSymptomCollection(session, userText) {
  // Use expanded extractor
  const { symptoms, symptomKeys } = extractSymptoms(userText);
  const ctxFromRules = extractClinicalContext(userText);

  if (symptoms.length === 0 && !ctxFromRules.recentTrauma) {
    return {
      reply: "Could you describe what you're experiencing? For example: 'I fell and hurt my ankle' or 'I have chest pain and shortness of breath.'",
    };
  }

  session.extractedSymptoms = mergeSymptoms(session.extractedSymptoms, symptoms);
  session.symptomKeys = Array.from(new Set([...(session.symptomKeys || []), ...symptomKeys]));

  // Build basic clinical context
  session.clinicalContext = mergeClinicalContext(session.clinicalContext || null, {
    primarySymptom:        symptoms[0] || null,
    bodyPart:              null,
    symptoms,
    duration:              ctxFromRules.duration,
    severity:              ctxFromRules.severity,
    mechanismOfInjury:     ctxFromRules.mechanismOfInjury,
    recentTrauma:          ctxFromRules.recentTrauma,
    functionalLimitations: ctxFromRules.functionalLimitations,
    associatedSymptoms:    [],
    riskFactors:           ctxFromRules.riskFactors,
  });

  session.interimRiskLevel = clinicalReasoner.calculateInterimRisk(session.clinicalContext);
  session.triageState = STATE.FOLLOW_UP_QUESTIONS;
  session.aiEngine    = 'rules';

  // Trauma detected? Use trauma flow
  const traumaQ = clinicalReasoner.getNextTraumaQuestion(
    session.clinicalContext,
    getAnsweredIds(session.answeredQuestions)
  );
  if (traumaQ) {
    session.lastAskedQuestionId   = traumaQ.id;
    session.lastAskedQuestionText = traumaQ.text;
    const reply = clinicalReasoner.buildFirstResponse(session.clinicalContext, traumaQ.text, symptoms);
    return { reply };
  }

  // Fall back to predefined flows
  const nextQ = rulesGetNextQuestion(session.symptomKeys, getAnsweredIds(session.answeredQuestions));
  if (!nextQ) return rulesHandleAssessmentReady(session);

  session.lastAskedQuestionId   = nextQ.id;
  session.lastAskedQuestionText = nextQ.text;

  const reply = clinicalReasoner.buildFirstResponse(session.clinicalContext, nextQ.text, symptoms);
  return { reply };
}

function rulesHandleFollowUpQuestions(session, userText) {
  const symptomKeys = getSymptomKeys(session);

  // 1. File answer
  if (session.lastAskedQuestionId) {
    const alreadyAnswered = session.answeredQuestions.some(
      (a) => a.questionId === session.lastAskedQuestionId
    );
    if (!alreadyAnswered) {
      const qDef = getQuestionById(session.lastAskedQuestionId);
      session.answeredQuestions.push({
        questionId: session.lastAskedQuestionId,
        question:   session.lastAskedQuestionText || session.lastAskedQuestionId,
        answer:     userText.trim(),
        symptomKey: qDef?.symptomKey || symptomKeys[0] || 'unknown',
      });
    }
    session.lastAskedQuestionId   = null;
    session.lastAskedQuestionText = null;
  }

  // 2. Update clinical context from answer
  const ctxFromAnswer = extractClinicalContext(userText);
  const { symptoms: newSymptoms, symptomKeys: newKeys } = extractSymptoms(userText);
  if (newSymptoms.length > 0) {
    session.extractedSymptoms = mergeSymptoms(session.extractedSymptoms, newSymptoms);
    session.symptomKeys = Array.from(new Set([...(session.symptomKeys || []), ...newKeys]));
  }
  if (ctxFromAnswer.recentTrauma || ctxFromAnswer.functionalLimitations.length > 0) {
    session.clinicalContext = mergeClinicalContext(session.clinicalContext, ctxFromAnswer);
  }

  // 3. Re-calculate interim risk
  session.interimRiskLevel = clinicalReasoner.calculateInterimRisk(session.clinicalContext);

  // 4. Next question — trauma flow first
  const answeredIds = getAnsweredIds(session.answeredQuestions);
  const traumaQ = clinicalReasoner.getNextTraumaQuestion(session.clinicalContext, answeredIds);
  if (traumaQ) {
    session.lastAskedQuestionId   = traumaQ.id;
    session.lastAskedQuestionText = traumaQ.text;
    return { reply: traumaQ.text };
  }

  // 5. Then predefined flows — use all available symptom keys
  const currentSymptomKeys = getSymptomKeys(session);

  // If symptomKeys is still empty (LLM sessions may not populate it),
  // derive from extractedSymptoms as a last resort
  if (currentSymptomKeys.length === 0 && session.extractedSymptoms.length > 0) {
    const { extractSymptoms: re } = require('./symptomExtractor');
    const derivedKeys = session.extractedSymptoms.flatMap(s => re(s).symptomKeys);
    session.symptomKeys = Array.from(new Set(derivedKeys));
  }

  const nextQ = rulesGetNextQuestion(getSymptomKeys(session), answeredIds);
  if (!nextQ) return rulesHandleAssessmentReady(session);

  session.lastAskedQuestionId   = nextQ.id;
  session.lastAskedQuestionText = nextQ.text;
  return { reply: nextQ.text };
}

function rulesHandleAssessmentReady(session) {
  // Use clinicalReasoner for context-aware routing
  const { department: ctxDept, riskLevel: ctxRisk } =
    clinicalReasoner.routeDepartment(session.clinicalContext);

  const symptomKeys = getSymptomKeys(session);
  const { riskLevel: ruleRisk, department: ruleDept, reason } =
    assessRisk(symptomKeys, session.answeredQuestions);

  // Context-aware result wins if it's more specific than rules
  const finalRisk = ctxRisk !== 'unknown' ? ctxRisk : ruleRisk;
  const finalDept = ctxDept !== 'General Practice' ? ctxDept : ruleDept;

  session.riskLevel   = finalRisk;
  session.department  = finalDept;
  session.triageResult = {
    riskLevel:  finalRisk,
    confidence: 0,
    department: finalDept,
    urgency:    URGENCY_MESSAGES[finalRisk] || URGENCY_MESSAGES.unknown,
    reasoning:  [reason],
    redFlags:   session.clinicalContext?.riskFactors || [],
    suggestedFollowUp: 'Follow up with your healthcare provider.',
    generatedBy: 'rules',
  };

  const summary = rulesSummary(session.toObject ? session.toObject() : session);
  session.summary     = summary;
  session.triageState = STATE.SUMMARY_READY;
  session.status      = 'completed';
  session.aiEngine    = 'rules';

  return {
    reply:
      `I've completed your intake assessment.\n\n` +
      `**Symptoms noted:** ${session.extractedSymptoms.join(', ')}\n` +
      `**Recommended department:** ${finalDept}\n` +
      `**Assessment:** ${reason}\n\n` +
      `${URGENCY_MESSAGES[finalRisk] || URGENCY_MESSAGES.unknown}\n\n` +
      `A detailed report has been prepared for your healthcare provider.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

async function processMessage(session, userText) {
  const useLLM = aiService.isAvailable();

  if (session.triageState === STATE.ASSESSMENT_READY || session.triageState === STATE.SUMMARY_READY) {
    return { reply: 'This session has been completed. If you have new symptoms, please start a new triage session.' };
  }

  if (session.triageState === STATE.STARTED) {
    session.triageState = STATE.SYMPTOM_COLLECTION;
    session.aiEngine    = useLLM ? 'llm' : 'rules';
    return {
      reply: "Hello! I'm MediQ, your AI health intake assistant. I'm here to help gather information about your symptoms so your care team is better prepared.\n\nPlease describe what you're experiencing today — what brought you in?",
    };
  }

  // LLM path
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
    }
  }

  // Rules fallback
  logState(session, 'RULES', session.triageState);

  if (session.triageState === STATE.SYMPTOM_COLLECTION) {
    return rulesHandleSymptomCollection(session, userText);
  }
  if (session.triageState === STATE.FOLLOW_UP_QUESTIONS) {
    return rulesHandleFollowUpQuestions(session, userText);
  }

  // ── Unknown / corrupt state recovery ────────────────────────────────────────
  // If the session already has symptoms and questions, resume follow-up.
  // Only reset to SYMPTOM_COLLECTION for truly fresh sessions.
  if (session.extractedSymptoms?.length > 0 || session.answeredQuestions?.length > 0) {
    session.triageState = STATE.FOLLOW_UP_QUESTIONS;
    return rulesHandleFollowUpQuestions(session, userText);
  }

  session.triageState = STATE.SYMPTOM_COLLECTION;
  return { reply: "Please describe what you're experiencing today." };
}

module.exports = { processMessage, STATE };
