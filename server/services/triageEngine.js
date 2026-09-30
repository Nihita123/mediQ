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

// ─── Rules-based structured summary builder ───────────────────────────────────

/**
 * Build a structured summary object (same shape as LLM output) from session data.
 * This lets the ClinicalSummaryCard render the physician-friendly format
 * even when the LLM is unavailable.
 */
function buildRulesStructuredSummary(session) {
  const ctx        = session.clinicalContext || {};
  const symptoms   = session.extractedSymptoms || [];
  const answered   = session.answeredQuestions || [];
  const riskLevel  = session.riskLevel || 'unknown';
  const department = session.department || 'General Practice';

  // ── Chief complaint ────────────────────────────────────────────────────────
  const primarySymptom = ctx.primarySymptom || symptoms[0] || 'presenting complaint';
  const duration       = ctx.duration || null;

  // "headache x since this morning" — avoid "x since since this morning"
  const durationSuffix = duration
    ? (duration.toLowerCase().startsWith('since') ? ` x ${duration}` : ` x ${duration}`)
    : '';
  const chiefComplaint = duration ? `${primarySymptom} x ${duration}` : primarySymptom;

  // ── History of Present Illness ─────────────────────────────────────────────
  const hpiParts = [];

  if (ctx.mechanismOfInjury) {
    hpiParts.push(`Patient reports ${ctx.mechanismOfInjury}.`);
  } else if (ctx.primarySymptom) {
    // Avoid "since since this morning" — only prepend "since" if duration doesn't already start with it
    const dur = duration
      ? (duration.toLowerCase().startsWith('since') ? ` ${duration}` : ` since ${duration}`)
      : '';
    hpiParts.push(`Patient presents with ${ctx.primarySymptom}${dur}.`);
  }

  if (ctx.severity) {
    hpiParts.push(`Severity is rated ${ctx.severity}.`);
  }

  if (ctx.bodyPart && ctx.recentTrauma) {
    hpiParts.push(`The ${ctx.bodyPart} is the affected area.`);
  }

  // Pull key facts from answered questions into HPI
  const weightQ = answered.find(a => a.questionId === 'trauma_weight_bearing');
  const swellQ  = answered.find(a => a.questionId === 'trauma_swelling_bruising');
  const popQ    = answered.find(a => a.questionId === 'trauma_pop_snap');
  const numbQ   = answered.find(a => a.questionId === 'trauma_numbness');

  if (weightQ) {
    const cantBear = /can'?t|cannot|unable|no|too/i.test(weightQ.answer);
    hpiParts.push(cantBear
      ? 'Patient is unable to bear weight on the affected limb.'
      : 'Patient is able to bear weight on the affected limb.');
  }
  if (swellQ) {
    const hasSwelling = /yes|swelling|bruising/i.test(swellQ.answer);
    hpiParts.push(hasSwelling
      ? 'There is visible swelling and/or bruising at the injury site.'
      : 'Patient denies visible swelling or bruising.');
  }
  if (popQ) {
    const heardPop = /yes|pop|snap|crack|heard/i.test(popQ.answer);
    if (heardPop) hpiParts.push('Patient reports an audible popping sensation at the time of injury.');
  }
  if (numbQ) {
    const hasNumb = /yes|numb|tingle|tingling/i.test(numbQ.answer);
    hpiParts.push(hasNumb
      ? 'Patient reports numbness or tingling in the affected area.'
      : 'Patient denies numbness or tingling.');
  }

  // Fall back to Q&A facts for non-trauma sessions — build natural clinical sentences
  if (hpiParts.length <= 1) {
    for (const aq of answered) {
      const ans   = aq.answer.trim();
      const lower = ans.toLowerCase();
      const qId   = aq.questionId;

      // Skip if it's a raw number or single word that makes no sense standalone
      if (/^\d+$/.test(ans)) continue;

      const isNegative = /^no\b|none|negative|didn'?t|don'?t|not\s/i.test(lower);

      // Map specific question IDs to natural clinical sentences
      if (qId === 'stomach_location' || qId === 'back_location') {
        hpiParts.push(`Pain is localised to the ${lower}.`);
      } else if (qId === 'stomach_severity' || qId === 'headache_severity' || qId === 'default_severity') {
        const match = lower.match(/\d+/);
        if (match) hpiParts.push(`Pain severity is rated ${match[0]}/10 by the patient.`);
      } else if (qId === 'stomach_onset' || qId === 'headache_onset' || qId === 'default_onset') {
        if (!isNegative) hpiParts.push(`Symptom onset: ${ans}.`);
      } else if (qId === 'stomach_vomiting' || qId === 'nausea_vomiting') {
        hpiParts.push(isNegative ? 'Patient denies vomiting.' : `Patient reports vomiting (${ans}).`);
      } else if (qId === 'vomiting_frequency') {
        hpiParts.push(`Patient reports vomiting ${ans}.`);
      } else if (qId === 'vomiting_blood') {
        hpiParts.push(isNegative ? 'Patient denies blood in vomit.' : 'Patient reports blood in vomit — urgent finding.');
      } else if (qId === 'vomiting_fluids') {
        hpiParts.push(isNegative ? 'Patient is unable to keep fluids down.' : 'Patient is able to tolerate fluids.');
      } else if (qId === 'stomach_bowel' || qId === 'diarrhea_onset') {
        hpiParts.push(isNegative ? 'Patient denies change in bowel habits.' : `Bowel habits: ${ans}.`);
      } else if (qId === 'diarrhea_frequency') {
        hpiParts.push(`Patient reports ${ans} loose stools.`);
      } else if (qId === 'diarrhea_blood') {
        hpiParts.push(isNegative ? 'Patient denies blood in stool.' : 'Patient reports blood in stool — urgent finding.');
      } else if (qId === 'headache_fever') {
        hpiParts.push(isNegative ? 'Patient denies fever and stiff neck.' : `Patient reports: ${ans}.`);
      } else if (qId === 'headache_vision') {
        hpiParts.push(isNegative ? 'Patient denies visual disturbance.' : `Associated symptoms: ${ans}.`);
      } else if (qId === 'headache_character' || qId === 'chest_pain_character') {
        hpiParts.push(`Pain is described as ${ans}.`);
      } else if (qId === 'fever_associated') {
        hpiParts.push(isNegative ? 'Patient denies associated chills or rigors.' : `Associated symptoms include: ${ans}.`);
      } else if (qId === 'default_associated') {
        hpiParts.push(isNegative ? 'Patient denies other associated symptoms.' : `Additional symptoms reported: ${ans}.`);
      } else {
        // Generic fallback — only use for questions we haven't specifically handled
        if (isNegative) {
          hpiParts.push(`Patient denies ${aq.question.toLowerCase().replace(/\?$/, '').trim()}.`);
        } else if (ans.length > 3) {
          // Only add if the answer is meaningful (not just "6" or "no")
          hpiParts.push(`Patient reports ${ans}.`);
        }
      }
    }
  }

  const historyOfPresentIllness = hpiParts.join(' ');

  // ── Suggested follow-up ────────────────────────────────────────────────────
  const followUpMap = {
    critical: 'Patient requires immediate emergency evaluation. Call 911 or go to the nearest Emergency Department now.',
    high:     `Patient should be seen urgently today at ${department}. Monitor for worsening symptoms.`,
    medium:   `Recommend assessment at ${department} within 24–48 hours.`,
    low:      `Recommend routine appointment with ${department}.`,
    unknown:  `Recommend assessment by a healthcare provider at ${department}.`,
  };
  const suggestedFollowUp = followUpMap[riskLevel] || followUpMap.unknown;

  // ── Red flags from clinical context ───────────────────────────────────────
  const redFlags = [];
  if (ctx.riskFactors?.includes('unable to bear weight')) redFlags.push('Unable to bear weight');
  if (ctx.riskFactors?.includes('high severity'))         redFlags.push(`High pain severity (${ctx.severity})`);
  if (ctx.riskFactors?.includes('recent trauma'))         redFlags.push('Acute traumatic injury');
  if (popQ && /yes|pop|snap|crack/i.test(popQ?.answer || '')) redFlags.push('Audible pop at time of injury');

  return {
    chiefComplaint,
    historyOfPresentIllness,
    symptoms,
    duration,
    severity:       ctx.severity || null,
    medicalHistory: ctx.medicalHistory || [],
    medications:    ctx.medications   || [],
    allergies:      ctx.allergies     || [],
    riskAssessment: {
      level:      riskLevel,
      confidence: session.triageResult?.confidence || 0,
      reasoning:  session.triageResult?.reasoning  || [],
    },
    recommendedDepartment: department,
    redFlags,
    suggestedFollowUp,
    disclaimer: 'This summary was generated by an AI intake assistant and represents a triage recommendation only. Clinical assessment by a qualified healthcare professional is required for diagnosis and treatment.',
  };
}

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
  let newContext;
  try {
    newContext = await aiService.extractEntities(userText, session.clinicalContext);
  } catch (err) {
    console.error(`[Triage][LLM] extractEntities failed — falling back to rules: ${err.message}`);
    return rulesHandleSymptomCollection(session, userText);
  }
  session.clinicalContext = mergeClinicalContext(session.clinicalContext, newContext);

  // 2. Update extractedSymptoms + symptomKeys for the rules engine / UI
  const allSymptomLabels = [
    ...(newContext.symptoms || []),
    // Only add primarySymptom if it's not already covered by the symptoms array
    ...(newContext.primarySymptom &&
        !(newContext.symptoms || []).some(
          (s) => s.toLowerCase().includes(newContext.primarySymptom.toLowerCase()) ||
                 newContext.primarySymptom.toLowerCase().includes(s.toLowerCase())
        )
      ? [newContext.primarySymptom]
      : []),
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
  let decision;
  try {
    decision = await aiService.getNextQuestion({
      clinicalContext:     session.clinicalContext,
      answeredQuestions:   session.answeredQuestions,
      conversationHistory: session.messages,
      lastPatientMessage:  userText,
    });
  } catch (err) {
    console.error(`[Triage][LLM] getNextQuestion failed on symptom collection — falling back to rules: ${err.message}`);
    return rulesHandleSymptomCollection(session, userText);
  }

  if (decision.decision === 'assessment_ready') {
    return llmHandleAssessmentReady(session);
  }

  // 5. Store the question pointer
  session.lastAskedQuestionId   = decision.questionId;
  session.lastAskedQuestionText = decision.questionText;

  // 6. Build contextually aware reply
  // If the LLM returned no question text, fall back to the rules engine
  // to get a concrete question rather than just showing an acknowledgement.
  if (!decision.questionText) {
    console.warn('[Triage][LLM] questionText was empty on symptom collection — falling back to rules');
    return rulesHandleSymptomCollection(session, userText);
  }

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
  let decision;
  try {
    decision = await aiService.getNextQuestion({
      clinicalContext:     session.clinicalContext,
      answeredQuestions:   session.answeredQuestions,
      conversationHistory: session.messages,
      lastPatientMessage:  userText,
    });
  } catch (err) {
    console.error(`[Triage][LLM] getNextQuestion failed — falling back to rules: ${err.message}`);
    session.lastAskedQuestionId   = null;
    session.lastAskedQuestionText = null;
    return rulesHandleFollowUpQuestions(session, userText);
  }

  if (decision.decision === 'assessment_ready') {
    return llmHandleAssessmentReady(session);
  }

  // 6. Store and build reply
  session.lastAskedQuestionId   = decision.questionId;
  session.lastAskedQuestionText = decision.questionText;

  const reply = clinicalReasoner.buildReply(decision, session.clinicalContext, userText);

  // If the LLM returned no usable question text, fall through to the rules engine
  // rather than sending a blank or repeated acknowledgement.
  if (!reply) {
    console.warn('[Triage][LLM] questionText was empty — falling back to rules for follow-up question');
    // Clear the placeholder question so the rules engine doesn't file an empty answer
    session.lastAskedQuestionId   = null;
    session.lastAskedQuestionText = null;
    return rulesHandleFollowUpQuestions(session, userText);
  }

  return { reply };
}

async function llmHandleAssessmentReady(session) {
  session.triageState = STATE.ASSESSMENT_READY;

  // Use clinicalReasoner for initial department routing
  const { department: routedDept, riskLevel: routedRisk } =
    clinicalReasoner.routeDepartment(session.clinicalContext);

  let triageResult;
  try {
    // Run full LLM triage for confidence scoring + reasoning
    triageResult = await aiService.assessTriage({
      extractedSymptoms: session.extractedSymptoms,
      answeredQuestions:  session.answeredQuestions,
      entities:           session.clinicalContext || {},
      messages:           session.messages,
    });
  } catch (err) {
    console.error(`[Triage][LLM] assessTriage failed — falling back to rules: ${err.message}`);
    return rulesHandleAssessmentReady(session);
  }

  // LLM result takes precedence; use routing as fallback
  session.riskLevel   = triageResult.riskLevel !== 'unknown' ? triageResult.riskLevel : routedRisk;
  session.department  = triageResult.department || routedDept;
  session.triageResult = { ...triageResult, generatedBy: 'llm' };

  let structuredSummary;
  try {
    structuredSummary = await aiService.generateSummary({
      extractedSymptoms: session.extractedSymptoms,
      answeredQuestions:  session.answeredQuestions,
      entities:           session.clinicalContext || {},
      triageResult,
      messages:           session.messages,
    });
  } catch (err) {
    console.error(`[Triage][LLM] generateSummary failed — using rules summary: ${err.message}`);
    const { generateSummary: rulesSummaryFn } = require('./triageAssessor');
    session.summary           = rulesSummaryFn(session.toObject ? session.toObject() : session);
    session.structuredSummary = buildRulesStructuredSummary(session);
    session.triageState = STATE.SUMMARY_READY;
    session.status      = 'completed';
    session.aiEngine    = 'rules';
    const urgencyMsg = URGENCY_MESSAGES[session.riskLevel] || URGENCY_MESSAGES.unknown;
    return {
      reply:
        `I've completed your intake assessment.\n\n` +
        `**Symptoms noted:** ${session.extractedSymptoms.join(', ')}\n` +
        `**Risk level:** ${session.riskLevel.toUpperCase()}\n` +
        `**Recommended department:** ${session.department}\n\n` +
        `${urgencyMsg}\n\n` +
        `A report has been prepared for your healthcare provider.`,
    };
  }

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
    primarySymptom:        symptoms[0] || (ctxFromRules.recentTrauma ? 'injury' : null),
    bodyPart:              ctxFromRules.bodyPart || null,
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

  // Trauma detected? Use trauma flow first
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

  // Fall back to predefined symptom flows
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

  // Estimate confidence from how much information was collected
  // More answered questions = higher confidence in the assessment
  const answeredCount = session.answeredQuestions.length;
  const confidence = Math.min(0.5 + answeredCount * 0.07, 0.92);

  // Use a clear reason — never show "Insufficient information" if we have answered questions
  const finalReason = reason === 'Insufficient information to determine triage priority.' && answeredCount > 0
    ? `Assessment based on ${answeredCount} clinical data point${answeredCount > 1 ? 's' : ''} collected during intake.`
    : reason;

  session.riskLevel   = finalRisk;
  session.department  = finalDept;
  session.triageResult = {
    riskLevel:  finalRisk,
    confidence,
    department: finalDept,
    urgency:    URGENCY_MESSAGES[finalRisk] || URGENCY_MESSAGES.unknown,
    reasoning:  [finalReason],
    redFlags:   session.clinicalContext?.riskFactors || [],
    suggestedFollowUp: 'Follow up with your healthcare provider as recommended.',
    generatedBy: 'rules',
  };

  const summary = rulesSummary(session.toObject ? session.toObject() : session);
  session.summary           = summary;
  session.structuredSummary = buildRulesStructuredSummary(session);
  session.triageState = STATE.SUMMARY_READY;
  session.status      = 'completed';
  session.aiEngine    = 'rules';

  const pct = Math.round(confidence * 100);

  return {
    reply:
      `I've completed your intake assessment.\n\n` +
      `**Symptoms noted:** ${session.extractedSymptoms.join(', ')}\n` +
      `**Risk level:** ${finalRisk.toUpperCase()} (${pct}% confidence)\n` +
      `**Recommended department:** ${finalDept}\n\n` +
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
