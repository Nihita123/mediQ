/**
 * services/symptomExtractor.js — Rule-based Symptom Extraction Engine
 *
 * Extracts structured symptoms from free-text patient input.
 * Architecture is designed so this entire module can be swapped
 * for an LLM call without changing the public API:
 *
 *   extractSymptoms(text) → { symptoms: string[], symptomKeys: string[] }
 *
 * ─── Extending ────────────────────────────────────────────────────────────────
 * To add a new symptom:
 *   1. Add an entry to SYMPTOM_DICTIONARY below.
 *   2. Add the corresponding follow-up questions to questionEngine.js.
 */

// ─── Symptom Dictionary ───────────────────────────────────────────────────────
// Each entry:
//   key        — internal identifier used by the question engine
//   label      — human-readable display label
//   patterns   — array of regex patterns (case-insensitive) that trigger this symptom

const SYMPTOM_DICTIONARY = [
  // ── Cardiovascular ────────────────────────────────────────────────────────
  {
    key: 'chest_pain',
    label: 'Chest Pain',
    patterns: [
      /chest\s*pain/,
      /chest\s*(discomfort|tightness|pressure|ache|hurts?|burning)/,
      /pain\s+in\s+(my\s+)?chest/,
      /heart\s*(pain|ache|hurts?)/,
      /angina/,
    ],
  },
  {
    key: 'palpitations',
    label: 'Heart Palpitations',
    patterns: [
      /palpitation/,
      /heart\s*(racing|pounding|fluttering|skipping|beating\s+fast)/,
      /irregular\s+heart(beat)?/,
      /rapid\s+(heart|pulse)/,
    ],
  },

  // ── Neurological ──────────────────────────────────────────────────────────
  {
    key: 'headache',
    label: 'Headache',
    patterns: [
      /head\s*ache/,
      /head\s*(pain|hurts?|throbbing|pounding)/,
      /migraine/,
      /pain\s+in\s+(my\s+)?head/,
    ],
  },
  {
    key: 'dizziness',
    label: 'Dizziness',
    patterns: [
      /dizz(y|iness)/,
      /light[\s-]?headed/,
      /vertigo/,
      /room\s+(is\s+)?spin(ning)?/,
      /feel(ing)?\s+(faint|unsteady|off[\s-]?balance)/,
    ],
  },
  {
    key: 'confusion',
    label: 'Confusion / Altered Mental Status',
    patterns: [
      /confus(ed|ion)/,
      /disoriented/,
      /altered\s+(mental|consciousness)/,
      /can'?t\s+think\s+clearly/,
      /mental\s+fog/,
    ],
  },

  // ── Respiratory ───────────────────────────────────────────────────────────
  {
    key: 'shortness_of_breath',
    label: 'Shortness of Breath',
    patterns: [
      /short(ness)?\s+of\s+breath/,
      /breath(ing)?\s+(difficulty|trouble|hard|problem)/,
      /can'?t\s+(breathe|catch\s+(my\s+)?breath)/,
      /dyspnea/,
      /wheezing/,
      /gasping/,
    ],
  },
  {
    key: 'cough',
    label: 'Cough',
    patterns: [
      /\bcough(ing)?\b/,
      /persistent\s+cough/,
      /dry\s+cough/,
      /wet\s+cough/,
      /coughing\s+up\s+blood/,
    ],
  },

  // ── Gastrointestinal ──────────────────────────────────────────────────────
  {
    key: 'stomach_pain',
    label: 'Stomach / Abdominal Pain',
    patterns: [
      /stomach\s*(pain|ache|hurts?|cramp)/,
      /abdominal\s*(pain|discomfort|cramp)/,
      /belly\s*(pain|ache|hurts?)/,
      /pain\s+in\s+(my\s+)?(stomach|abdomen|belly|gut)/,
    ],
  },
  {
    key: 'nausea',
    label: 'Nausea',
    patterns: [
      /nausea/,
      /feel(ing)?\s+(sick|nauseous|queasy)/,
      /want\s+to\s+(throw\s+up|vomit)/,
    ],
  },
  {
    key: 'vomiting',
    label: 'Vomiting',
    patterns: [
      /vomit(ing)?/,
      /throw(ing)?\s+up/,
      /puking/,
    ],
  },
  {
    key: 'diarrhea',
    label: 'Diarrhea',
    patterns: [
      /diarr?hea/,
      /loose\s+stool/,
      /runny\s+stool/,
      /watery\s+stool/,
    ],
  },

  // ── Constitutional ────────────────────────────────────────────────────────
  {
    key: 'fever',
    label: 'Fever',
    patterns: [
      /\bfever\b/,
      /high\s+(temperature|temp)/,
      /temperature\s+(of\s+)?\d+/,
      /feel(ing)?\s+(hot|feverish)/,
      /chills\s+(and|with)\s+fever/,
    ],
  },
  {
    key: 'chills',
    label: 'Chills',
    patterns: [
      /\bchills?\b/,
      /shiver(ing)?/,
      /feel(ing)?\s+cold\s+and\s+shaky/,
    ],
  },
  {
    key: 'fatigue',
    label: 'Fatigue / Weakness',
    patterns: [
      /\bfatigu(e|ed)\b/,
      /\bweakness\b/,
      /feel(ing)?\s+(tired|exhausted|drained|weak)/,
      /no\s+energy/,
    ],
  },

  // ── Musculoskeletal ───────────────────────────────────────────────────────
  {
    key: 'back_pain',
    label: 'Back Pain',
    patterns: [
      /back\s*(pain|ache|hurts?)/,
      /pain\s+in\s+(my\s+)?back/,
      /lower\s+back\s+pain/,
      /upper\s+back\s+pain/,
    ],
  },
  {
    key: 'joint_pain',
    label: 'Joint Pain',
    patterns: [
      /joint\s*(pain|ache|swelling)/,
      /(knee|hip|shoulder|elbow|wrist|ankle)\s*(pain|ache|swelling|hurts?)/,
    ],
  },

  // ── Integumentary ─────────────────────────────────────────────────────────
  {
    key: 'rash',
    label: 'Rash / Skin Changes',
    patterns: [
      /\brash\b/,
      /skin\s*(rash|irritation|redness|lesion|hives)/,
      /itchy\s+(skin|rash)/,
      /\bhives\b/,
    ],
  },

  // ── Ophthalmologic ────────────────────────────────────────────────────────
  {
    key: 'vision_changes',
    label: 'Vision Changes',
    patterns: [
      /vision\s*(change|problem|blur|loss)/,
      /blurr(y|ed)\s+vision/,
      /can'?t\s+see\s+(well|clearly)/,
      /double\s+vision/,
      /vision\s+loss/,
    ],
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract symptoms from free-text patient input.
 *
 * @param {string} text — Raw patient message
 * @returns {{ symptoms: string[], symptomKeys: string[] }}
 *   symptoms    — Human-readable labels (e.g. ["Chest Pain", "Dizziness"])
 *   symptomKeys — Internal keys for the question engine (e.g. ["chest_pain", "dizziness"])
 */
function extractSymptoms(text) {
  if (!text || typeof text !== 'string') {
    return { symptoms: [], symptomKeys: [] };
  }

  const lower = text.toLowerCase();
  const matched = [];

  for (const symptom of SYMPTOM_DICTIONARY) {
    const found = symptom.patterns.some((pattern) => pattern.test(lower));
    if (found) {
      matched.push(symptom);
    }
  }

  return {
    symptoms: matched.map((s) => s.label),
    symptomKeys: matched.map((s) => s.key),
  };
}

/**
 * Merge new symptoms into an existing list (deduplication).
 *
 * @param {string[]} existing — Current extracted symptoms array
 * @param {string[]} incoming — Newly extracted symptoms
 * @returns {string[]} Deduplicated merged array
 */
function mergeSymptoms(existing, incoming) {
  const set = new Set([...existing, ...incoming]);
  return Array.from(set);
}

/**
 * Get the full dictionary entry for a symptom key.
 *
 * @param {string} key
 * @returns {{ key: string, label: string, patterns: RegExp[] } | undefined}
 */
function getSymptomByKey(key) {
  return SYMPTOM_DICTIONARY.find((s) => s.key === key);
}

module.exports = { extractSymptoms, mergeSymptoms, getSymptomByKey, SYMPTOM_DICTIONARY };
