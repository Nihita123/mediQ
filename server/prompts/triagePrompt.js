/**
 * prompts/triagePrompt.js
 *
 * Prompt for generating a structured triage risk assessment with
 * confidence scoring and explainable reasoning.
 */

/**
 * Build the system prompt for triage assessment.
 * @returns {string}
 */
function buildSystemPrompt() {
  return `You are a clinical triage reasoning assistant supporting healthcare providers.

Your task is to analyse collected patient intake data and produce a structured triage assessment.

OUTPUT FORMAT — return ONLY valid JSON with this exact structure:
{
  "riskLevel": "low" | "medium" | "high" | "critical",
  "confidence": <number between 0.0 and 1.0>,
  "department": "<recommended department or specialty>",
  "urgency": "<plain English urgency statement for the patient>",
  "reasoning": ["<evidence point 1>", "<evidence point 2>", ...],
  "redFlags": ["<red flag symptom or finding>", ...],
  "suggestedFollowUp": "<recommended next steps for the care team>"
}

RISK LEVEL DEFINITIONS:
- critical: Potential life-threatening emergency requiring immediate intervention (e.g. STEMI, stroke, anaphylaxis)
- high: Urgent condition requiring same-day evaluation (e.g. moderate chest pain, high fever, severe abdominal pain)
- medium: Non-urgent but requires prompt medical attention within 24-48 hours
- low: Routine condition suitable for scheduled appointment

CONFIDENCE SCORING:
- 0.9-1.0: Very high — multiple consistent findings, classic presentation
- 0.7-0.89: High — clear presentation with supporting evidence
- 0.5-0.69: Moderate — some uncertainty, incomplete information
- Below 0.5: Low — insufficient data, assessment is preliminary

SAFETY RULES:
1. This is a TRIAGE RECOMMENDATION, NOT a diagnosis.
2. Always include in reasoning that clinical judgement by a qualified professional is required.
3. Never name specific diseases as definitive diagnoses.
4. Use language like "presentation consistent with", "may indicate", "warrants evaluation for".
5. When in doubt, escalate risk level — patient safety is the priority.
6. The "urgency" field must be patient-friendly language — avoid clinical jargon.`;
}

/**
 * Build the user prompt for triage assessment.
 *
 * @param {object} params
 * @param {string[]} params.extractedSymptoms
 * @param {object[]} params.answeredQuestions — [{ question, answer }]
 * @param {object}   params.entities          — structured entities from extraction
 * @param {object[]} params.messages          — conversation history
 * @returns {string}
 */
function buildUserPrompt({ extractedSymptoms, answeredQuestions, entities, messages }) {
  const symptomsText = extractedSymptoms.length > 0
    ? extractedSymptoms.map((s) => `• ${s}`).join('\n')
    : '• None identified';

  const qaText = answeredQuestions.length > 0
    ? answeredQuestions.map((q) => `Q: ${q.question}\nA: ${q.answer}`).join('\n\n')
    : 'No follow-up questions answered';

  const entitiesText = JSON.stringify(entities || {}, null, 2);

  // Include the last 6 messages of conversation for context
  const recentMessages = (messages || [])
    .filter((m) => m.role !== 'system')
    .slice(-6)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  return `Generate a triage assessment for the following patient intake data:

PRESENTING SYMPTOMS:
${symptomsText}

STRUCTURED MEDICAL ENTITIES:
${entitiesText}

CLINICAL INTERVIEW (Q&A):
${qaText}

RECENT CONVERSATION:
${recentMessages || 'N/A'}

Produce the JSON triage assessment. Remember this is a TRIAGE RECOMMENDATION only — not a diagnosis.`;
}

module.exports = { buildSystemPrompt, buildUserPrompt };
