/**
 * services/questionEngine.js — Dynamic Follow-up Question Engine
 *
 * Maps symptom keys to ordered question flows.
 * Each question is asked exactly once per session.
 *
 * ─── Extending ────────────────────────────────────────────────────────────────
 * To add questions for a new symptom:
 *   1. Add the symptom to symptomExtractor.js SYMPTOM_DICTIONARY.
 *   2. Add a corresponding entry to QUESTION_FLOWS below.
 *   3. Optionally add risk keywords to riskAssessor.js.
 */

// ─── Question Flow Definitions ────────────────────────────────────────────────
/**
 * Each flow is keyed by the symptomKey from the extractor.
 * Questions are asked in array order.
 *
 * Question shape:
 *   id       — unique across ALL questions (symptomKey_slug)
 *   text     — exact text sent to patient
 *   required — if true, session won't advance state until answered
 */

const QUESTION_FLOWS = {
  chest_pain: [
    {
      id: 'chest_pain_onset',
      text: 'When did the chest pain begin? (e.g. "2 hours ago", "this morning")',
      required: true,
    },
    {
      id: 'chest_pain_severity',
      text: 'On a scale of 1 to 10, how severe is the chest pain right now?',
      required: true,
    },
    {
      id: 'chest_pain_radiation',
      text: 'Does the pain spread to your arm, jaw, neck, or back?',
      required: true,
    },
    {
      id: 'chest_pain_character',
      text: 'How would you describe the pain? (e.g. sharp, dull, pressure, burning, squeezing)',
      required: false,
    },
    {
      id: 'chest_pain_triggers',
      text: 'Does the pain get worse with activity or stress, or is it constant?',
      required: false,
    },
    {
      id: 'chest_pain_cardiac_history',
      text: 'Do you have a history of heart disease, previous heart attacks, or high blood pressure?',
      required: true,
    },
  ],

  palpitations: [
    {
      id: 'palpitations_onset',
      text: 'When did the palpitations start?',
      required: true,
    },
    {
      id: 'palpitations_duration',
      text: 'How long do they last each time? (e.g. seconds, minutes, ongoing)',
      required: true,
    },
    {
      id: 'palpitations_associated',
      text: 'Are the palpitations accompanied by chest pain, dizziness, or shortness of breath?',
      required: true,
    },
    {
      id: 'palpitations_history',
      text: 'Do you have any known heart conditions or are you on any heart medications?',
      required: false,
    },
  ],

  headache: [
    {
      id: 'headache_onset',
      text: 'When did the headache begin?',
      required: true,
    },
    {
      id: 'headache_severity',
      text: 'On a scale of 1 to 10, how severe is the headache?',
      required: true,
    },
    {
      id: 'headache_character',
      text: 'How would you describe it? (e.g. throbbing, pressure, stabbing, dull)',
      required: false,
    },
    {
      id: 'headache_fever',
      text: 'Do you also have a fever or stiff neck?',
      required: true,
    },
    {
      id: 'headache_vision',
      text: 'Are you experiencing any vision changes, light sensitivity, or nausea?',
      required: true,
    },
    {
      id: 'headache_injury',
      text: 'Did the headache come on after any head injury or trauma?',
      required: true,
    },
  ],

  dizziness: [
    {
      id: 'dizziness_onset',
      text: 'When did the dizziness start?',
      required: true,
    },
    {
      id: 'dizziness_type',
      text: 'Does the room spin around you (vertigo), or do you just feel lightheaded / faint?',
      required: true,
    },
    {
      id: 'dizziness_triggers',
      text: 'Does the dizziness happen when you stand up, move your head, or is it constant?',
      required: false,
    },
    {
      id: 'dizziness_associated',
      text: 'Do you also have hearing loss, ringing in your ears, or vision changes?',
      required: false,
    },
  ],

  shortness_of_breath: [
    {
      id: 'sob_onset',
      text: 'When did the shortness of breath begin?',
      required: true,
    },
    {
      id: 'sob_severity',
      text: 'Can you speak full sentences, or is breathing very difficult right now?',
      required: true,
    },
    {
      id: 'sob_triggers',
      text: 'Does it happen at rest, with activity, or both?',
      required: true,
    },
    {
      id: 'sob_history',
      text: 'Do you have asthma, COPD, or any other lung or heart condition?',
      required: false,
    },
  ],

  fever: [
    {
      id: 'fever_temperature',
      text: 'What is your current temperature, if you know it?',
      required: false,
    },
    {
      id: 'fever_duration',
      text: 'How long have you had the fever?',
      required: true,
    },
    {
      id: 'fever_associated',
      text: 'Do you also have chills, sweating, body aches, or a rash?',
      required: true,
    },
    {
      id: 'fever_travel',
      text: 'Have you travelled recently or been exposed to anyone who was ill?',
      required: false,
    },
    {
      id: 'fever_cough',
      text: 'Do you have a cough, sore throat, or any respiratory symptoms?',
      required: false,
    },
  ],

  stomach_pain: [
    {
      id: 'stomach_location',
      text: 'Where exactly is the pain — upper abdomen, lower abdomen, around the navel, or all over?',
      required: true,
    },
    {
      id: 'stomach_onset',
      text: 'How long have you had this pain?',
      required: true,
    },
    {
      id: 'stomach_severity',
      text: 'On a scale of 1 to 10, how severe is the abdominal pain?',
      required: true,
    },
    {
      id: 'stomach_vomiting',
      text: 'Do you have nausea or vomiting?',
      required: true,
    },
    {
      id: 'stomach_bowel',
      text: 'Any changes in bowel habits — diarrhea or constipation?',
      required: true,
    },
  ],

  cough: [
    {
      id: 'cough_onset',
      text: 'How long have you had the cough?',
      required: true,
    },
    {
      id: 'cough_type',
      text: 'Is it a dry cough or are you coughing up mucus? If mucus, what colour is it?',
      required: true,
    },
    {
      id: 'cough_blood',
      text: 'Are you coughing up any blood?',
      required: true,
    },
    {
      id: 'cough_fever',
      text: 'Do you also have a fever, shortness of breath, or chest pain?',
      required: false,
    },
  ],

  nausea: [
    {
      id: 'nausea_onset',
      text: 'When did the nausea start?',
      required: true,
    },
    {
      id: 'nausea_vomiting',
      text: 'Have you been vomiting as well?',
      required: true,
    },
    {
      id: 'nausea_food',
      text: 'Could this be related to something you ate or drank recently?',
      required: false,
    },
  ],

  vomiting: [
    {
      id: 'vomiting_frequency',
      text: 'How many times have you vomited and over what time period?',
      required: true,
    },
    {
      id: 'vomiting_blood',
      text: 'Is there any blood or dark material ("coffee grounds") in the vomit?',
      required: true,
    },
    {
      id: 'vomiting_fluids',
      text: 'Are you able to keep any fluids down?',
      required: true,
    },
  ],

  diarrhea: [
    {
      id: 'diarrhea_onset',
      text: 'When did the diarrhea begin?',
      required: true,
    },
    {
      id: 'diarrhea_frequency',
      text: 'How many times have you had loose stools in the last 24 hours?',
      required: true,
    },
    {
      id: 'diarrhea_blood',
      text: 'Is there any blood or mucus in the stool?',
      required: true,
    },
    {
      id: 'diarrhea_fever',
      text: 'Do you also have a fever, severe cramping, or vomiting?',
      required: false,
    },
  ],

  back_pain: [
    {
      id: 'back_onset',
      text: 'When did the back pain start?',
      required: true,
    },
    {
      id: 'back_location',
      text: 'Is it upper back, lower back, or one side?',
      required: true,
    },
    {
      id: 'back_radiation',
      text: 'Does the pain shoot down your leg or into your groin?',
      required: true,
    },
    {
      id: 'back_injury',
      text: 'Did the pain follow an injury, fall, or lifting something heavy?',
      required: false,
    },
  ],

  fatigue: [
    {
      id: 'fatigue_onset',
      text: 'How long have you been feeling fatigued or weak?',
      required: true,
    },
    {
      id: 'fatigue_severity',
      text: 'Is the weakness affecting your ability to walk or do daily activities?',
      required: true,
    },
    {
      id: 'fatigue_associated',
      text: 'Do you also have shortness of breath, chest pain, or fever?',
      required: false,
    },
  ],

  rash: [
    {
      id: 'rash_location',
      text: 'Where on your body is the rash?',
      required: true,
    },
    {
      id: 'rash_onset',
      text: 'When did the rash appear?',
      required: true,
    },
    {
      id: 'rash_character',
      text: 'Is the rash itchy, painful, raised, or blistering?',
      required: true,
    },
    {
      id: 'rash_fever',
      text: 'Do you also have a fever, difficulty breathing, or swelling?',
      required: true,
    },
  ],

  vision_changes: [
    {
      id: 'vision_onset',
      text: 'When did the vision change begin?',
      required: true,
    },
    {
      id: 'vision_type',
      text: 'Is it blurry vision, double vision, loss of vision, or something else?',
      required: true,
    },
    {
      id: 'vision_headache',
      text: 'Do you also have a headache, eye pain, or light sensitivity?',
      required: true,
    },
  ],

  // Default fallback for any unrecognised symptom
  _default: [
    {
      id: 'default_onset',
      text: 'When did this symptom start?',
      required: true,
    },
    {
      id: 'default_severity',
      text: 'On a scale of 1 to 10, how severe is it?',
      required: true,
    },
    {
      id: 'default_associated',
      text: 'Are there any other symptoms you are experiencing alongside this?',
      required: false,
    },
  ],
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build an ordered list of question IDs that need to be asked for a set
 * of symptom keys. Already-answered question IDs are excluded.
 *
 * @param {string[]} symptomKeys     — e.g. ["chest_pain", "dizziness"]
 * @param {string[]} answeredIds     — question IDs already answered
 * @returns {Array<{id, text, symptomKey}>} Flat ordered queue
 */
function buildQuestionQueue(symptomKeys, answeredIds = []) {
  const answeredSet = new Set(answeredIds);
  const queue = [];

  for (const key of symptomKeys) {
    const flow = QUESTION_FLOWS[key] || QUESTION_FLOWS._default;
    for (const question of flow) {
      if (!answeredSet.has(question.id)) {
        queue.push({ ...question, symptomKey: key });
      }
    }
  }

  return queue;
}

/**
 * Get the next unanswered question for a session.
 *
 * @param {string[]} symptomKeys
 * @param {string[]} answeredIds
 * @returns {{ id: string, text: string, symptomKey: string } | null}
 */
function getNextQuestion(symptomKeys, answeredIds = []) {
  const queue = buildQuestionQueue(symptomKeys, answeredIds);
  return queue.length > 0 ? queue[0] : null;
}

/**
 * Count how many required questions remain unanswered.
 *
 * @param {string[]} symptomKeys
 * @param {string[]} answeredIds
 * @returns {number}
 */
function countRemainingRequired(symptomKeys, answeredIds = []) {
  const queue = buildQuestionQueue(symptomKeys, answeredIds);
  return queue.filter((q) => q.required).length;
}

/**
 * Get the full question object by its ID.
 *
 * @param {string} questionId
 * @returns {{ id, text, required, symptomKey } | undefined}
 */
function getQuestionById(questionId) {
  for (const [symptomKey, flow] of Object.entries(QUESTION_FLOWS)) {
    const found = flow.find((q) => q.id === questionId);
    if (found) return { ...found, symptomKey };
  }
  return undefined;
}

module.exports = {
  QUESTION_FLOWS,
  buildQuestionQueue,
  getNextQuestion,
  countRemainingRequired,
  getQuestionById,
};
