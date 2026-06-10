/**
 * services/reasoning/clinicalReasoner.js
 *
 * The core reasoning layer that sits between the LLM output and the patient reply.
 *
 * Architecture:
 *   LLM → structured JSON (clinicalContext + questionDecision)
 *   → clinicalReasoner.buildReply()
 *   → string reply to patient
 *
 * This module owns:
 *   - Contextual acknowledgement generation
 *   - Trauma workflow detection & routing
 *   - Question flow decisions (rules-based)
 *   - Interim risk re-assessment after every message
 *   - Department routing with specialty awareness
 */

// ─── Trauma question flows ─────────────────────────────────────────────────────
// Used when trauma is detected but no LLM is available, or as base questions
// the reasoning engine uses to identify what's still missing.

const TRAUMA_QUESTION_FLOWS = {
  ankle_injury: [
    { id: 'trauma_weight_bearing',    text: 'Can you put any weight on the ankle at all, or is it too painful to stand?',          required: true },
    { id: 'trauma_swelling_bruising', text: 'Is there visible swelling or bruising around the ankle?',                              required: true },
    { id: 'trauma_pop_snap',          text: 'Did you hear or feel a popping or snapping sensation when it happened?',               required: true },
    { id: 'trauma_numbness',          text: 'Do you have any numbness, tingling, or loss of feeling in the foot?',                  required: false },
    { id: 'trauma_deformity',         text: 'Does the ankle look deformed or out of place compared to normal?',                    required: false },
  ],
  knee_injury: [
    { id: 'trauma_weight_bearing',    text: 'Can you walk on the leg or is it too painful to bear weight?',                        required: true },
    { id: 'trauma_swelling_bruising', text: 'Is there swelling or bruising around the knee?',                                      required: true },
    { id: 'trauma_pop_snap',          text: 'Did you hear or feel a pop when the injury happened?',                                required: true },
    { id: 'trauma_locking',           text: 'Does the knee feel unstable, or does it lock when you try to move it?',               required: false },
  ],
  head_injury: [
    { id: 'head_consciousness',       text: 'Did you lose consciousness, even briefly, when you hit your head?',                   required: true },
    { id: 'head_confusion',           text: 'Are you feeling confused, disoriented, or having trouble remembering what happened?', required: true },
    { id: 'head_nausea_vomiting',     text: 'Have you had nausea or vomiting since the injury?',                                   required: true },
    { id: 'head_vision',              text: 'Any blurred or double vision, or sensitivity to light?',                              required: false },
  ],
  general_trauma: [
    { id: 'trauma_mechanism_detail',  text: 'Can you describe exactly how the injury happened?',                                   required: true },
    { id: 'trauma_weight_bearing',    text: 'Are you able to use the injured area normally, or is movement very painful?',         required: true },
    { id: 'trauma_swelling',          text: 'Is there any swelling or bruising at the injury site?',                               required: true },
    { id: 'trauma_numbness',          text: 'Do you have any numbness or tingling in the area?',                                   required: false },
  ],
};

// ─── Department routing rules ──────────────────────────────────────────────────

const DEPARTMENT_RULES = [
  // Trauma / Orthopaedic
  { conditions: (ctx) => ctx.recentTrauma && ctx.riskFactors?.includes('unable to bear weight'), dept: 'Orthopaedics / Urgent Care', risk: 'high' },
  { conditions: (ctx) => ctx.recentTrauma && ctx.bodyPart && ['head', 'skull', 'brain'].includes(ctx.bodyPart?.toLowerCase()), dept: 'Emergency Medicine', risk: 'high' },
  { conditions: (ctx) => ctx.recentTrauma, dept: 'Urgent Care / Orthopaedics', risk: 'medium' },
  // Cardiac
  { conditions: (ctx) => ctx.symptoms?.includes('chest pain') && ctx.associatedSymptoms?.includes('shortness of breath'), dept: 'Emergency — Cardiology', risk: 'critical' },
  { conditions: (ctx) => ctx.symptoms?.includes('chest pain'), dept: 'Emergency / Urgent Care — Cardiology', risk: 'high' },
  // Respiratory
  { conditions: (ctx) => ctx.functionalLimitations?.includes('difficulty breathing'), dept: 'Emergency — Respiratory', risk: 'high' },
  // Neurology
  { conditions: (ctx) => ctx.symptoms?.includes('headache') && ctx.associatedSymptoms?.includes('blurred vision'), dept: 'Emergency — Neurology', risk: 'high' },
  // Dermatology
  { conditions: (ctx) => ctx.symptoms?.includes('rash'), dept: 'Dermatology / General Practice', risk: 'low' },
  // GI
  { conditions: (ctx) => ctx.symptoms?.includes('stomach pain') || ctx.symptoms?.includes('abdominal pain'), dept: 'General Practice / Gastroenterology', risk: 'medium' },
  // Default
  { conditions: () => true, dept: 'General Practice', risk: 'unknown' },
];

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Detect which trauma flow to use based on clinical context.
 * @param {object} ctx — clinicalContext
 * @returns {Array|null} Question flow array or null
 */
function getTraumaFlow(ctx) {
  if (!ctx?.recentTrauma && !ctx?.mechanismOfInjury) return null;

  const bodyPart = (ctx.bodyPart || ctx.primarySymptom || '').toLowerCase();

  if (/ankle|foot/.test(bodyPart))  return TRAUMA_QUESTION_FLOWS.ankle_injury;
  if (/knee/.test(bodyPart))        return TRAUMA_QUESTION_FLOWS.knee_injury;
  if (/head|skull/.test(bodyPart))  return TRAUMA_QUESTION_FLOWS.head_injury;
  return TRAUMA_QUESTION_FLOWS.general_trauma;
}

/**
 * Get the next unanswered trauma question.
 * @param {object} ctx
 * @param {string[]} answeredIds
 * @returns {{ id, text }|null}
 */
function getNextTraumaQuestion(ctx, answeredIds = []) {
  const flow = getTraumaFlow(ctx);
  if (!flow) return null;
  const answered = new Set(answeredIds);
  return flow.find((q) => !answered.has(q.id)) || null;
}

/**
 * Route to department based on clinical context.
 * @param {object} ctx
 * @returns {{ department: string, riskLevel: string }}
 */
function routeDepartment(ctx) {
  if (!ctx) return { department: 'General Practice', riskLevel: 'unknown' };
  for (const rule of DEPARTMENT_RULES) {
    if (rule.conditions(ctx)) {
      return { department: rule.dept, riskLevel: rule.risk };
    }
  }
  return { department: 'General Practice', riskLevel: 'unknown' };
}

/**
 * Calculate interim risk level from clinical context.
 * Called after every patient message to update real-time risk.
 * @param {object} ctx
 * @returns {'low'|'medium'|'high'|'critical'|'unknown'}
 */
function calculateInterimRisk(ctx) {
  if (!ctx) return 'unknown';
  const rf = ctx.riskFactors || [];
  const symptoms = [...(ctx.symptoms || []), ...(ctx.associatedSymptoms || [])].map(s => s.toLowerCase());
  const fl = ctx.functionalLimitations || [];

  // Critical
  if (symptoms.some(s => s.includes('chest pain')) && symptoms.some(s => s.includes('shortness'))) return 'critical';
  if (fl.includes('difficulty breathing')) return 'critical';
  if (ctx.bodyPart?.toLowerCase().includes('head') && ctx.recentTrauma) return 'high';

  // High
  if (rf.includes('unable to bear weight') && rf.includes('recent trauma')) return 'high';
  if (rf.includes('high severity') && rf.includes('recent trauma')) return 'high';
  if (symptoms.some(s => s.includes('chest pain'))) return 'high';

  // Medium
  if (rf.includes('recent trauma')) return 'medium';
  if (rf.includes('high severity')) return 'medium';
  if (symptoms.some(s => s.includes('stomach pain') || s.includes('abdominal'))) return 'medium';

  // Low
  if (ctx.primarySymptom) return 'low';

  return 'unknown';
}

/**
 * Build a contextually aware acknowledgement sentence.
 * @param {object} ctx — clinicalContext
 * @param {string} lastMessage
 * @returns {string}
 */
function buildAcknowledgement(ctx, lastMessage) {
  if (!ctx) return '';

  if (ctx.recentTrauma && ctx.mechanismOfInjury) {
    const part = ctx.bodyPart ? `your ${ctx.bodyPart}` : 'the injured area';
    return `Since this happened after ${ctx.mechanismOfInjury}, I'd like to ask a few specific questions about ${part}.`;
  }

  if (ctx.recentTrauma) {
    const part = ctx.bodyPart ? `your ${ctx.bodyPart}` : 'the injury';
    return `I understand this is an injury-related concern. I have a few questions to assess ${part} properly.`;
  }

  if (ctx.functionalLimitations?.length > 0) {
    return `I understand you're having difficulty with ${ctx.functionalLimitations[0]}. I have a few questions to better understand the situation.`;
  }

  if (ctx.primarySymptom) {
    const dur = ctx.duration ? ` for ${ctx.duration}` : '';
    return `I've noted that you're experiencing ${ctx.primarySymptom}${dur}.`;
  }

  return '';
}

/**
 * Build the final patient-facing reply from a question decision.
 * @param {object} questionDecision — from LLM or rules
 * @param {object} ctx — current clinicalContext
 * @param {string} lastMessage
 * @returns {string}
 */
function buildReply(questionDecision, ctx, lastMessage) {
  if (!questionDecision) {
    return "Could you describe what you're experiencing in more detail?";
  }

  const ack = questionDecision.contextAcknowledgement
    || buildAcknowledgement(ctx, lastMessage);

  if (questionDecision.decision === 'assessment_ready') return null; // caller handles

  const question = questionDecision.questionText;
  if (!question) return buildAcknowledgement(ctx, lastMessage) || "Could you describe your symptoms in more detail?";

  return ack ? `${ack}\n\n${question}` : question;
}

/**
 * Build first-message response after symptom extraction.
 * Acknowledges what was said and asks the most important next question.
 * @param {object} ctx — extracted clinicalContext
 * @param {string} firstQuestion — the question to ask
 * @param {string[]} symptomLabels — extracted symptom labels
 * @returns {string}
 */
function buildFirstResponse(ctx, firstQuestion, symptomLabels) {
  const noted = symptomLabels.length > 0
    ? `I've noted: ${symptomLabels.map(s => `• ${s}`).join('\n')}`
    : '';

  const ack = buildAcknowledgement(ctx, '');
  const intro = ack || 'I have a few follow-up questions to better understand your situation.';

  const parts = [noted, intro, firstQuestion].filter(Boolean);
  return parts.join('\n\n');
}

module.exports = {
  getTraumaFlow,
  getNextTraumaQuestion,
  routeDepartment,
  calculateInterimRisk,
  buildAcknowledgement,
  buildReply,
  buildFirstResponse,
  TRAUMA_QUESTION_FLOWS,
};
