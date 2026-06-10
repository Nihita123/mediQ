/**
 * services/symptomExtractor.js  (v2)
 *
 * Rule-based fallback extractor with vastly expanded semantic patterns.
 * Now recognises natural language variants, body-part pain expressions,
 * trauma triggers, and functional limitation language.
 *
 * The LLM path uses its own prompt-based extraction but this module
 * is used for:
 *   1. Rule-based fallback when no LLM is configured
 *   2. Supplementing LLM results with reliable pattern matching
 *   3. Real-time symptom key mapping from LLM-extracted labels
 */

const SYMPTOM_DICTIONARY = [
  // ── Musculoskeletal / Injury ──────────────────────────────────────────────
  {
    key: 'joint_pain',
    label: 'Joint / Limb Pain',
    patterns: [
      // Ankle
      /ankle\s*(pain|hurts?|ache|paining|sore|swollen|injury|injured)/,
      /pain\s+(in|around|near)\s+(my\s+)?ankle/,
      /twisted?\s+(my\s+)?ankle/,
      /sprained?\s+(my\s+)?ankle/,
      // Knee
      /knee\s*(pain|hurts?|ache|paining|sore|swollen|injury|injured)/,
      /pain\s+(in|around|near)\s+(my\s+)?knee/,
      /injured\s+(my\s+)?knee/,
      // General joint
      /joint\s*(pain|ache|swelling|swollen)/,
      /(hip|shoulder|elbow|wrist)\s*(pain|ache|hurts?|sore|swollen)/,
      // Leg / foot
      /leg\s*(pain|hurts?|ache|paining)/,
      /foot\s*(pain|hurts?|ache|paining)/,
      /foot\s+hurts/,
      /my\s+(leg|foot|ankle|knee)\s+(is\s+)?(hurting|paining|aching|sore)/,
      // Arm
      /arm\s*(pain|hurts?|ache|paining)/,
    ],
  },
  {
    key: 'trauma_injury',
    label: 'Traumatic Injury',
    patterns: [
      /\bfell\b/,
      /\bfall(ing)?\b/,
      /\bslipped?\b/,
      /\btwisted?\b/,
      /\bsprained?\b/,
      /\binjured?\s+(while|during|playing|running|working)/,
      /\baccident\b/,
      /\bcar\s+(accident|crash|collision)/,
      /\bcrash(ed)?\b/,
      /\bcollision\b/,
      /\bhit\s+(my|the)\b/,
      /\bknocked?\b/,
      /\bstruck\b/,
      /\bimpact\b/,
      /playing\s+(sports?|football|cricket|basketball|tennis)/,
      /while\s+playing/,
      /while\s+running/,
      /while\s+exercising/,
      /during\s+(exercise|sport|training|practice)/,
    ],
  },
  {
    key: 'back_pain',
    label: 'Back Pain',
    patterns: [
      /back\s*(pain|ache|hurts?)/,
      /pain\s+in\s+(my\s+)?(back|spine|lower\s+back|upper\s+back)/,
      /lower\s+back/,
      /upper\s+back/,
      /spine\s*(pain|hurts?)/,
    ],
  },

  // ── Cardiovascular ────────────────────────────────────────────────────────
  {
    key: 'chest_pain',
    label: 'Chest Pain',
    patterns: [
      /chest\s*(pain|discomfort|tightness|pressure|ache|hurts?|burning|squeezing)/,
      /pain\s+in\s+(my\s+)?chest/,
      /heart\s*(pain|ache|hurts?|racing|pounding)/,
      /angina/,
      /\bpalpitation/,
      /heart\s*(racing|pounding|fluttering|skipping|beating\s+fast)/,
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
      /my\s+head\s+(is\s+)?(hurting|aching|paining)/,
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
      /feel(ing)?\s+(faint|unsteady|off[\s-]?balance|woozy)/,
      /losing\s+(my\s+)?balance/,
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
      /not\s+thinking\s+straight/,
    ],
  },

  // ── Respiratory ───────────────────────────────────────────────────────────
  {
    key: 'shortness_of_breath',
    label: 'Shortness of Breath',
    patterns: [
      /short(ness)?\s+of\s+breath/,
      /breath(ing)?\s+(difficulty|trouble|hard|problem|laboured)/,
      /can'?t\s+(breathe|catch\s+(my\s+)?breath)/,
      /difficulty\s+breath/,
      /dyspnea/,
      /wheezing/,
      /gasping/,
      /out\s+of\s+breath/,
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
      /stomach\s*(pain|ache|hurts?|cramp|paining)/,
      /abdominal\s*(pain|discomfort|cramp)/,
      /belly\s*(pain|ache|hurts?)/,
      /pain\s+in\s+(my\s+)?(stomach|abdomen|belly|gut|tummy)/,
      /tummy\s*(ache|pain|hurts?)/,
      /my\s+stomach\s+(is\s+)?(hurting|aching|paining)/,
    ],
  },
  {
    key: 'nausea',
    label: 'Nausea',
    patterns: [
      /nausea/,
      /feel(ing)?\s+(sick|nauseous|queasy)/,
      /want\s+to\s+(throw\s+up|vomit)/,
      /feel\s+like\s+vomiting/,
    ],
  },
  {
    key: 'vomiting',
    label: 'Vomiting',
    patterns: [/vomit(ing)?/, /throw(ing)?\s+up/, /puking/],
  },
  {
    key: 'diarrhea',
    label: 'Diarrhea',
    patterns: [/diarr?hea/, /loose\s+stool/, /runny\s+stool/, /watery\s+stool/],
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
      /running\s+a\s+(temperature|fever)/,
    ],
  },
  {
    key: 'chills',
    label: 'Chills',
    patterns: [/\bchills?\b/, /shiver(ing)?/, /feel(ing)?\s+cold\s+and\s+shaky/],
  },
  {
    key: 'fatigue',
    label: 'Fatigue / Weakness',
    patterns: [
      /\bfatigu(e|ed)\b/,
      /\bweakness\b/,
      /feel(ing)?\s+(tired|exhausted|drained|weak)/,
      /no\s+energy/,
      /body\s+(weakness|weak)/,
    ],
  },

  // ── Integumentary ─────────────────────────────────────────────────────────
  {
    key: 'rash',
    label: 'Rash / Skin Changes',
    patterns: [
      /\brash\b/,
      /skin\s*(rash|irritation|redness|lesion|hives|itching)/,
      /itchy\s+(skin|rash)/,
      /\bhives\b/,
      /skin\s*is\s*(red|itchy|irritated)/,
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

// ── Functional limitation patterns (separate — used for clinical context) ──
const FUNCTIONAL_LIMITATION_PATTERNS = [
  { pattern: /can['\u2019]?t\s+(walk|stand|run|move)/,        label: 'unable to walk/stand' },
  { pattern: /unable\s+to\s+(walk|stand|run|move)/,           label: 'unable to walk/stand' },
  { pattern: /cannot\s+(walk|stand|run|move)/,                label: 'unable to walk/stand' },
  { pattern: /difficulty\s+(walk|stand|run|mov)/,             label: 'difficulty walking' },
  { pattern: /can['\u2019]?t\s+put\s+weight/,                 label: 'unable to bear weight' },
  { pattern: /cannot\s+put\s+weight/,                         label: 'unable to bear weight' },
  { pattern: /unable\s+to\s+bear\s+weight/,                   label: 'unable to bear weight' },
  { pattern: /not\s+able\s+to\s+(walk|stand|bear\s+weight)/,  label: 'unable to bear weight' },
  { pattern: /limping/,                                        label: 'limping' },
  { pattern: /can['\u2019]?t\s+walk\s+properly/,              label: 'difficulty walking' },
  { pattern: /can['\u2019]?t\s+bend/,                         label: 'reduced range of motion' },
  { pattern: /can['\u2019]?t\s+lift/,                         label: 'unable to lift' },
  { pattern: /can['\u2019]?t\s+(use|move)\s+(my\s+)?(arm|leg|hand|foot)/, label: 'limb immobility' },
  { pattern: /difficulty\s+breath/,                           label: 'difficulty breathing' },
  { pattern: /can['\u2019]?t\s+breathe/,                      label: 'difficulty breathing' },
  { pattern: /cannot\s+breathe/,                              label: 'difficulty breathing' },
];

// ── Trauma trigger patterns ────────────────────────────────────────────────
const TRAUMA_PATTERNS = [
  /\bfell\b/, /\bfall(ing)?\b/, /\bslipped?\b/, /\btwisted?\b/, /\bsprained?\b/,
  /\binjured?\s+(while|during|playing|running)/, /\baccident\b/,
  /\bcar\s+(accident|crash)/, /\bcrashed?\b/, /\bcollision\b/,
  /\bhit\s+(my|the)\b/, /\bknocked?\b/, /\bstruck\b/, /\bimpact\b/,
  /while\s+playing/, /while\s+running/, /during\s+(exercise|sport|training)/,
];

/**
 * Extract symptoms from free-text using pattern matching.
 * Returns both human-readable labels and internal keys.
 */
function extractSymptoms(text) {
  if (!text || typeof text !== 'string') return { symptoms: [], symptomKeys: [] };
  const lower = text.toLowerCase();
  const matched = SYMPTOM_DICTIONARY.filter(
    (s) => s.patterns.some((p) => p.test(lower))
  );
  return {
    symptoms:    matched.map((s) => s.label),
    symptomKeys: matched.map((s) => s.key),
  };
}

/**
 * Extract clinical context beyond simple symptom labels.
 * Returns structured fields useful for the reasoning engine.
 */
function extractClinicalContext(text) {
  if (!text || typeof text !== 'string') return {};
  const lower = text.toLowerCase();

  // Trauma
  const recentTrauma = TRAUMA_PATTERNS.some((p) => p.test(lower));

  // Functional limitations
  const functionalLimitations = FUNCTIONAL_LIMITATION_PATTERNS
    .filter((f) => f.pattern.test(lower))
    .map((f) => f.label);

  // Duration — look for time expressions
  const durationMatch = lower.match(
    /(\d+)\s*(minute|min|hour|hr|day|week|month)s?\s+ago|since\s+(\w+)/
  );
  const duration = durationMatch ? durationMatch[0] : null;

  // Severity — numeric or descriptive
  const severityMatch = lower.match(/\b([1-9]|10)\s*(?:out\s+of\s*10|\/\s*10)\b/) ||
                        lower.match(/\b(mild|moderate|severe|extreme|excruciating|very\s+bad|really\s+bad|badly)\b/);
  const severity = severityMatch ? severityMatch[0] : null;

  // Mechanism of injury
  const mechMatch = lower.match(
    /(fell?|slipped?|twisted?|sprained?|hit\s+\w+|collided?|crashed?|while\s+\w+ing)[^.]{0,40}/
  );
  const mechanismOfInjury = mechMatch ? mechMatch[0].trim() : null;

  // Build risk factors
  const riskFactors = [];
  if (recentTrauma) riskFactors.push('recent trauma');
  if (functionalLimitations.some(l => l.includes('bear weight') || l.includes('walk'))) {
    riskFactors.push('unable to bear weight');
  }
  if (severity && (severity.includes('severe') || severity.includes('excruciating') || /\b[89]|10\b/.test(severity))) {
    riskFactors.push('high severity');
  }

  return {
    recentTrauma,
    functionalLimitations,
    duration,
    severity,
    mechanismOfInjury,
    riskFactors,
  };
}

function mergeSymptoms(existing, incoming) {
  return Array.from(new Set([...existing, ...incoming]));
}

function getSymptomByKey(key) {
  return SYMPTOM_DICTIONARY.find((s) => s.key === key);
}

module.exports = {
  extractSymptoms,
  extractClinicalContext,
  mergeSymptoms,
  getSymptomByKey,
  SYMPTOM_DICTIONARY,
  TRAUMA_PATTERNS,
  FUNCTIONAL_LIMITATION_PATTERNS,
};
