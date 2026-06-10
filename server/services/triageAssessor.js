/**
 * services/triageAssessor.js — Risk Assessment & Department Routing
 *
 * Analyses extracted symptoms and answered questions to produce:
 *   - riskLevel: 'low' | 'medium' | 'high' | 'critical'
 *   - department: Recommended hospital department
 *   - summary: Structured intake summary for the physician
 *
 * This module is rule-based and can be replaced by an LLM call
 * without changing the public interface.
 */

// ─── Risk Rules ───────────────────────────────────────────────────────────────

/**
 * Each rule has:
 *   symptomKeys  — set of keys that must ALL be present (AND logic)
 *   OR           — any of these symptom keys (OR logic, checked independently)
 *   riskLevel    — assigned risk if rule matches
 *   department   — routing target
 *   reason       — plain-text clinical reason (included in summary)
 *
 * Rules are evaluated in order; first match wins.
 */
const RISK_RULES = [
  // ── Critical / Emergency ──────────────────────────────────────────────────
  {
    OR: ['chest_pain'],
    answerContains: { questionId: 'chest_pain_radiation', keywords: ['yes', 'arm', 'jaw', 'back', 'neck'] },
    riskLevel: 'critical',
    department: 'Emergency — Cardiology',
    reason: 'Chest pain with radiation to arm/jaw/back suggests possible acute coronary syndrome.',
  },
  {
    symptomKeys: ['chest_pain', 'shortness_of_breath'],
    riskLevel: 'critical',
    department: 'Emergency — Cardiology',
    reason: 'Chest pain combined with shortness of breath is a high-priority cardiac presentation.',
  },
  {
    symptomKeys: ['chest_pain', 'dizziness'],
    riskLevel: 'high',
    department: 'Emergency — Cardiology',
    reason: 'Chest pain with dizziness may indicate haemodynamic compromise.',
  },
  {
    OR: ['shortness_of_breath'],
    answerContains: { questionId: 'sob_severity', keywords: ["can't speak", "can't breathe", 'very difficult', 'severe'] },
    riskLevel: 'critical',
    department: 'Emergency — Respiratory',
    reason: 'Severe dyspnoea requires immediate evaluation.',
  },
  {
    symptomKeys: ['confusion'],
    riskLevel: 'critical',
    department: 'Emergency — Neurology',
    reason: 'Altered mental status is a red-flag neurological symptom.',
  },

  // ── High ──────────────────────────────────────────────────────────────────
  {
    OR: ['chest_pain'],
    riskLevel: 'high',
    department: 'Emergency / Urgent Care — Cardiology',
    reason: 'Chest pain requires prompt cardiac evaluation.',
  },
  {
    OR: ['shortness_of_breath'],
    riskLevel: 'high',
    department: 'Urgent Care — Respiratory',
    reason: 'Shortness of breath requires timely assessment.',
  },
  {
    symptomKeys: ['headache'],
    answerContains: { questionId: 'headache_fever', keywords: ['yes', 'stiff neck', 'both'] },
    riskLevel: 'high',
    department: 'Emergency — Neurology / Infectious Disease',
    reason: 'Headache with fever and stiff neck may indicate meningitis.',
  },
  {
    symptomKeys: ['headache'],
    answerContains: { questionId: 'headache_severity', keywords: ['10', '9', '8', 'worst'] },
    riskLevel: 'high',
    department: 'Emergency — Neurology',
    reason: 'Sudden severe headache ("thunderclap") warrants urgent investigation.',
  },
  {
    OR: ['vomiting'],
    answerContains: { questionId: 'vomiting_blood', keywords: ['yes', 'blood', 'coffee'] },
    riskLevel: 'high',
    department: 'Emergency — Gastroenterology',
    reason: 'Haematemesis (blood in vomit) requires urgent evaluation.',
  },
  {
    symptomKeys: ['fever'],
    answerContains: { questionId: 'fever_temperature', keywords: ['104', '105', '106', '40', '41', '42'] },
    riskLevel: 'high',
    department: 'Urgent Care — General Medicine / Infectious Disease',
    reason: 'Very high fever (>40°C / 104°F) requires prompt treatment.',
  },

  // ── Medium ────────────────────────────────────────────────────────────────
  {
    OR: ['fever'],
    riskLevel: 'medium',
    department: 'General Practice / Urgent Care',
    reason: 'Fever warrants clinical assessment.',
  },
  {
    OR: ['headache'],
    riskLevel: 'medium',
    department: 'General Practice / Neurology',
    reason: 'Headache with associated symptoms warrants evaluation.',
  },
  {
    OR: ['stomach_pain'],
    riskLevel: 'medium',
    department: 'General Practice / Gastroenterology',
    reason: 'Abdominal pain requires assessment.',
  },
  {
    OR: ['dizziness'],
    riskLevel: 'medium',
    department: 'General Practice / ENT / Neurology',
    reason: 'Dizziness may have multiple aetiologies requiring evaluation.',
  },
  {
    symptomKeys: ['nausea', 'vomiting', 'diarrhea'],
    riskLevel: 'medium',
    department: 'General Practice / Gastroenterology',
    reason: 'GI symptoms (nausea, vomiting, diarrhoea) suggest possible gastroenteritis.',
  },

  // ── Low ───────────────────────────────────────────────────────────────────
  {
    OR: ['nausea'],
    riskLevel: 'low',
    department: 'General Practice',
    reason: 'Nausea without associated urgent symptoms is suitable for routine evaluation.',
  },
  {
    OR: ['cough'],
    riskLevel: 'low',
    department: 'General Practice',
    reason: 'Isolated cough without red-flag symptoms is typically a primary care presentation.',
  },
  {
    OR: ['fatigue'],
    riskLevel: 'low',
    department: 'General Practice',
    reason: 'Fatigue without associated urgent symptoms is suitable for routine evaluation.',
  },
  {
    OR: ['back_pain'],
    riskLevel: 'low',
    department: 'General Practice / Orthopaedics / Physiotherapy',
    reason: 'Back pain is commonly musculoskeletal and suitable for primary care.',
  },
  {
    OR: ['joint_pain'],
    riskLevel: 'low',
    department: 'General Practice / Rheumatology',
    reason: 'Joint pain is typically suitable for routine evaluation.',
  },
  {
    OR: ['rash'],
    riskLevel: 'low',
    department: 'General Practice / Dermatology',
    reason: 'Rash without systemic symptoms is suitable for routine evaluation.',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Check whether a specific question's answer contains any of the given keywords.
 *
 * @param {Array} answeredQuestions — session.answeredQuestions
 * @param {string} questionId
 * @param {string[]} keywords
 * @returns {boolean}
 */
function answerMatchesKeywords(answeredQuestions, questionId, keywords) {
  const aq = answeredQuestions.find((a) => a.questionId === questionId);
  if (!aq) return false;
  const lower = aq.answer.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Assess triage risk level and routing department.
 *
 * @param {string[]} symptomKeys        — e.g. ["chest_pain", "dizziness"]
 * @param {Array}    answeredQuestions  — session.answeredQuestions array
 * @returns {{ riskLevel: string, department: string, reason: string }}
 */
function assessRisk(symptomKeys, answeredQuestions = []) {
  const keySet = new Set(symptomKeys);

  for (const rule of RISK_RULES) {
    // Check AND symptomKeys
    const andMatch = rule.symptomKeys
      ? rule.symptomKeys.every((k) => keySet.has(k))
      : true;

    // Check OR symptomKeys
    const orMatch = rule.OR ? rule.OR.some((k) => keySet.has(k)) : true;

    if (!andMatch || !orMatch) continue;

    // Check answer-level conditions if present
    if (rule.answerContains) {
      const { questionId, keywords } = rule.answerContains;
      if (!answerMatchesKeywords(answeredQuestions, questionId, keywords)) continue;
    }

    return {
      riskLevel: rule.riskLevel,
      department: rule.department,
      reason: rule.reason,
    };
  }

  // Default — not enough information to classify
  return {
    riskLevel: 'unknown',
    department: 'General Practice',
    reason: 'Insufficient information to determine triage priority.',
  };
}

/**
 * Generate a structured plain-language summary for the physician.
 *
 * @param {object} session — Mongoose session document (plain object)
 * @returns {string}
 */
function generateSummary(session) {
  const {
    extractedSymptoms = [],
    answeredQuestions = [],
    riskLevel = 'unknown',
    department = 'General Practice',
  } = session;

  const lines = [];

  lines.push(`PATIENT INTAKE SUMMARY`);
  lines.push(`======================`);
  lines.push(`Risk Level : ${riskLevel.toUpperCase()}`);
  lines.push(`Department : ${department}`);
  lines.push('');

  if (extractedSymptoms.length > 0) {
    lines.push(`Presenting Symptoms:`);
    extractedSymptoms.forEach((s) => lines.push(`  • ${s}`));
    lines.push('');
  }

  if (answeredQuestions.length > 0) {
    lines.push(`Clinical Intake Details:`);
    answeredQuestions.forEach((aq) => {
      lines.push(`  Q: ${aq.question}`);
      lines.push(`  A: ${aq.answer}`);
      lines.push('');
    });
  }

  lines.push(`Note: This summary was generated by the MediQ AI intake assistant.`);
  lines.push(`Clinical judgement by a qualified professional is required.`);

  return lines.join('\n');
}

module.exports = { assessRisk, generateSummary };
