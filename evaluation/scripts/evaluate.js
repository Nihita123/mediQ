/**
 * scripts/evaluate.js
 *
 * Runs the complete evaluation pipeline against the master dataset.
 * Does NOT start the production server — calls the triage engine directly.
 *
 * Usage: node scripts/evaluate.js [--limit 20] [--source hand_curated]
 */

'use strict';

const fs      = require('fs');
const path    = require('path');

// ─── Paths ────────────────────────────────────────────────────────────────────
const ROOT           = path.join(__dirname, '..', '..');
const DATASETS_DIR   = path.join(__dirname, '..', 'datasets');
const REPORTS_DIR    = path.join(__dirname, '..', 'reports');

const MASTER_PATH    = path.join(DATASETS_DIR, 'master_evaluation_dataset.json');

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const limitArg   = args.indexOf('--limit');
const sourceArg  = args.indexOf('--source');
const LIMIT      = limitArg !== -1  ? parseInt(args[limitArg + 1])  : Infinity;
const FILTER_SRC = sourceArg !== -1 ? args[sourceArg + 1]           : null;

// ─── Load server modules (no DB, no HTTP — direct engine calls) ───────────────
// Load dotenv from server's node_modules (evaluation has no dotenv dependency)
try {
  const dotenvPath = path.join(ROOT, 'server', 'node_modules', 'dotenv');
  require(dotenvPath).config({ path: path.join(ROOT, 'server', '.env') });
} catch {
  // dotenv not available — env vars may already be set
}

const { processMessage, STATE } = require(path.join(ROOT, 'server', 'services', 'triageEngine'));
const { extractSymptoms, extractClinicalContext } = require(path.join(ROOT, 'server', 'services', 'symptomExtractor'));
const { assessRisk, generateSummary: _genSummary } = require(path.join(ROOT, 'server', 'services', 'triageAssessor'));
const { routeDepartment } = require(path.join(ROOT, 'server', 'services', 'reasoning', 'clinicalReasoner'));

// Wrap the summary generator to work with plain objects
function generateSummaryText({ extractedSymptoms, answeredQuestions, riskLevel, department }) {
  return _genSummary({ extractedSymptoms, answeredQuestions, riskLevel, department });
}

// ─── Load dataset ─────────────────────────────────────────────────────────────
if (!fs.existsSync(MASTER_PATH)) {
  console.error('Run build_dataset.js first.');
  process.exit(1);
}

let cases = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));
if (FILTER_SRC) cases = cases.filter((c) => c.source === FILTER_SRC);
if (LIMIT < Infinity) cases = cases.slice(0, LIMIT);

console.log(`\nMediQ Evaluation Pipeline`);
console.log(`${'═'.repeat(50)}`);
console.log(`Cases to evaluate : ${cases.length}`);
console.log(`Filter by source  : ${FILTER_SRC || 'all'}`);
console.log(`Started at        : ${new Date().toISOString()}\n`);

// ─── Mock session factory ─────────────────────────────────────────────────────
function createSession() {
  const s = {
    triageState:           STATE.SYMPTOM_COLLECTION,
    extractedSymptoms:     [],
    symptomKeys:           [],
    answeredQuestions:     [],
    clinicalContext:       null,
    interimRiskLevel:      'unknown',
    messages:              [],
    aiEngine:              'rules',
    status:                'active',
    riskLevel:             'unknown',
    department:            null,
    summary:               null,
    structuredSummary:     null,
    lastAskedQuestionId:   null,
    lastAskedQuestionText: null,
    medicalEntities:       null,
    triageResult:          null,
  };
  s.toObject = () => JSON.parse(JSON.stringify(s));
  return s;
}

function reloadSession(s) {
  const saved = JSON.parse(JSON.stringify(s));
  saved.toObject = () => JSON.parse(JSON.stringify(saved));
  return saved;
}

// ─── Metrics helpers ──────────────────────────────────────────────────────────

function normalise(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

function symptomOverlap(predicted, expected) {
  const predSet = new Set(predicted.map(normalise));
  const expSet  = new Set(expected.map(normalise));

  let tp = 0, fp = 0, fn = 0;

  // Fuzzy match — if any expected word appears in any predicted item
  for (const exp of expSet) {
    const matched = [...predSet].some((p) =>
      p.includes(exp) || exp.includes(p) || exp.split(' ').some((w) => p.includes(w))
    );
    if (matched) tp++; else fn++;
  }
  for (const p of predSet) {
    const matched = [...expSet].some((e) =>
      p.includes(e) || e.includes(p) || p.split(' ').some((w) => e.includes(w))
    );
    if (!matched) fp++;
  }

  const precision = (tp + fp) === 0 ? 0 : tp / (tp + fp);
  const recall    = (tp + fn) === 0 ? 0 : tp / (tp + fn);
  const f1        = (precision + recall) === 0 ? 0 : 2 * precision * recall / (precision + recall);

  return { precision, recall, f1, tp, fp, fn };
}

function entityMatch(predicted, expected) {
  const fields = ['bodyPart', 'severity', 'duration', 'mechanismOfInjury', 'functionalLimitation'];
  let matches = 0, total = 0;
  const perField = {};

  for (const f of fields) {
    const expVal  = expected?.[f];
    const predVal = predicted?.[f];
    if (!expVal) continue; // skip if not annotated
    total++;
    const match = predVal && normalise(predVal).includes(normalise(expVal).split(' ')[0]);
    perField[f] = match ? 1 : 0;
    if (match) matches++;
  }

  return { accuracy: total === 0 ? 1 : matches / total, perField, total };
}

function riskMatch(predicted, expected) {
  return normalise(predicted) === normalise(expected);
}

function departmentMatch(predicted, expected) {
  const p = normalise(predicted);
  const e = normalise(expected);
  if (p === e) return 1;
  // Partial credit — check main specialty
  const eWords = e.split(/[\s\/\-]+/).filter((w) => w.length > 3);
  const overlap = eWords.filter((w) => p.includes(w)).length;
  return overlap / Math.max(eWords.length, 1);
}

function keywordCoverage(summary, keywords) {
  if (!summary || !keywords?.length) return 0;
  const lowerSummary = normalise(summary);
  const matched = keywords.filter((kw) => lowerSummary.includes(normalise(kw)));
  return matched.length / keywords.length;
}

// ─── Run one case ─────────────────────────────────────────────────────────────

async function runCase(c) {
  const startTime = Date.now();
  let session = createSession();
  const transcript = [];
  const questionsAsked = new Set();
  let repeatedQuestions = 0;
  let contextRetained = true;

  // Turn 1: initial complaint
  const r0 = await processMessage(session, c.patient_input);
  session.messages.push({ role: 'user',      content: c.patient_input, timestamp: new Date() });
  session.messages.push({ role: 'assistant', content: r0.reply,        timestamp: new Date() });
  transcript.push({ turn: 1, user: c.patient_input, ai: r0.reply });

  if (session.lastAskedQuestionId) {
    if (questionsAsked.has(session.lastAskedQuestionId)) repeatedQuestions++;
    else questionsAsked.add(session.lastAskedQuestionId);
  }

  session = reloadSession(session);

  // Simulate answering follow-up questions (max 6 turns)
  const SIMULATED_ANSWERS = [
    'About 30 minutes ago',
    'The pain is 7 out of 10',
    'Yes, there is swelling',
    'No, I do not have other conditions',
    'No recent travel',
    'No medications currently',
  ];

  for (let turn = 0; turn < 6; turn++) {
    if (session.triageState === STATE.SUMMARY_READY || session.status === 'completed') break;

    const answer = SIMULATED_ANSWERS[turn] || 'I am not sure';
    const r = await processMessage(session, answer);

    session.messages.push({ role: 'user',      content: answer,    timestamp: new Date() });
    session.messages.push({ role: 'assistant', content: r.reply,   timestamp: new Date() });
    transcript.push({ turn: turn + 2, user: answer, ai: r.reply });

    // Check for repeated questions
    if (session.lastAskedQuestionId) {
      if (questionsAsked.has(session.lastAskedQuestionId)) repeatedQuestions++;
      else questionsAsked.add(session.lastAskedQuestionId);
    }

    // Context retention: AI should not re-ask about info in patient_input
    const patientInputLower = c.patient_input.toLowerCase();
    const replyLower = r.reply.toLowerCase();
    // Detect if AI asks for something already in the original message
    if (session.clinicalContext?.duration && replyLower.includes('how long') &&
        patientInputLower.match(/\d+\s*(minute|min|hour|day|week)/)) {
      contextRetained = false;
    }

    session = reloadSession(session);
  }

  const latency = Date.now() - startTime;

  // ─── Force assessment on incomplete sessions ───────────────────────────────
  // If the conversation didn't reach SUMMARY_READY within the turn limit,
  // force an assessment from whatever data was collected. This mirrors what
  // the engine does at end-of-session and gives a fair risk/dept prediction.
  if (session.triageState !== STATE.SUMMARY_READY && session.riskLevel === 'unknown') {
    const { symptoms: baseSymptoms, symptomKeys: baseKeys } = extractSymptoms(c.patient_input);
    const forceKeys = session.symptomKeys?.length > 0 ? session.symptomKeys : baseKeys;

    if (forceKeys.length > 0) {
      try {
        const forced = assessRisk(forceKeys, session.answeredQuestions || []);
        session.riskLevel  = forced.riskLevel;
        session.department = forced.department;
        // Build a plain text summary for keyword scoring
        session.summary    = generateSummaryText({
          extractedSymptoms: session.extractedSymptoms.length > 0
            ? session.extractedSymptoms
            : baseSymptoms,
          answeredQuestions: session.answeredQuestions || [],
          riskLevel:   forced.riskLevel,
          department:  forced.department,
        });
      } catch { /* non-fatal */ }
    }

    // Use clinicalReasoner for context-aware dept routing if still unknown
    if (session.riskLevel === 'unknown' && session.clinicalContext) {
      const { department: ctxDept, riskLevel: ctxRisk } =
        routeDepartment(session.clinicalContext);
      if (ctxRisk !== 'unknown') {
        session.riskLevel  = ctxRisk;
        session.department = ctxDept;
      }
    }
  }

  // ─── Collect predictions ────────────────────────────────────────────────────

  // Always extract from patient_input as baseline (rule engine)
  const { symptoms: ruleSymptoms, symptomKeys: ruleKeys } = extractSymptoms(c.patient_input);
  const clinCtx = extractClinicalContext(c.patient_input);

  // Prefer session symptoms (accumulated over conversation); fall back to direct extraction
  const predictedSymptoms = session.extractedSymptoms.length > 0
    ? session.extractedSymptoms
    : ruleSymptoms;

  // Use final risk from session (may have been forced above); fall back to interim
  const predictedRisk = (session.riskLevel && session.riskLevel !== 'unknown')
    ? session.riskLevel
    : (session.interimRiskLevel || 'unknown');

  const predictedDept = session.department || 'General Practice';

  // Prefer LLM-extracted entities; fall back to rule-based extraction from patient_input
  const predictedEntities = session.clinicalContext || {
    bodyPart:            clinCtx.mechanismOfInjury ? null : null,
    severity:            clinCtx.severity,
    duration:            clinCtx.duration,
    mechanismOfInjury:   clinCtx.mechanismOfInjury,
    functionalLimitation: clinCtx.functionalLimitations?.[0] || null,
  };

  const summaryText = session.summary || '';

  // ─── Compute metrics ────────────────────────────────────────────────────────

  const symMetrics      = symptomOverlap(predictedSymptoms, c.expected_symptoms);
  const entityMetrics   = entityMatch(predictedEntities, c.expected_entities);
  const riskCorrect     = riskMatch(predictedRisk, c.expected_risk);
  const deptScore       = departmentMatch(predictedDept, c.expected_department);
  const kwCoverage      = keywordCoverage(summaryText, c.expected_summary_keywords);

  return {
    id:               c.id,
    source:           c.source,
    category:         c.category,
    patient_input:    c.patient_input,
    expected_risk:    c.expected_risk,
    expected_department: c.expected_department,
    predicted_risk:   predictedRisk,
    predicted_department: predictedDept,
    predicted_symptoms: predictedSymptoms,
    predicted_entities: predictedEntities,
    symptom_metrics:  symMetrics,
    entity_metrics:   entityMetrics,
    risk_correct:     riskCorrect,
    department_score: deptScore,
    keyword_coverage: kwCoverage,
    questions_asked:  questionsAsked.size,
    repeated_questions: repeatedQuestions,
    context_retained: contextRetained,
    session_completed: session.triageState === STATE.SUMMARY_READY,
    ai_engine:        session.aiEngine,
    latency_ms:       latency,
    transcript:       transcript,
  };
}

// ─── Main evaluation loop ─────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const results    = [];
  const startTotal = Date.now();
  let done = 0;

  for (const c of cases) {
    process.stdout.write(`  [${++done}/${cases.length}] ${c.id.padEnd(12)} `);
    try {
      const result = await runCase(c);
      results.push(result);
      const risk = result.risk_correct ? '✓' : '✗';
      const sym  = result.symptom_metrics.f1.toFixed(2);
      process.stdout.write(`risk:${risk} sym_f1:${sym} dept:${result.department_score.toFixed(2)} | ${result.latency_ms}ms\n`);
    } catch (err) {
      console.error(`\n  ERROR on ${c.id}: ${err.message}`);
      results.push({ id: c.id, source: c.source, category: c.category, error: err.message });
    }
  }

  const totalTime = Date.now() - startTotal;

  // ─── Aggregate metrics ───────────────────────────────────────────────────────

  const valid = results.filter((r) => !r.error);

  function avg(arr) { return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length; }

  const symPrecision   = avg(valid.map((r) => r.symptom_metrics.precision));
  const symRecall      = avg(valid.map((r) => r.symptom_metrics.recall));
  const symF1          = avg(valid.map((r) => r.symptom_metrics.f1));
  const entityAcc      = avg(valid.map((r) => r.entity_metrics.accuracy));
  const riskAcc        = valid.filter((r) => r.risk_correct).length / valid.length;
  const deptAcc        = avg(valid.map((r) => r.department_score));
  const kwCov          = avg(valid.map((r) => r.keyword_coverage));
  const avgLatency     = avg(valid.map((r) => r.latency_ms));
  const repeatRate     = avg(valid.map((r) => r.repeated_questions / Math.max(r.questions_asked, 1)));
  const contextRate    = valid.filter((r) => r.context_retained).length / valid.length;
  const completionRate = valid.filter((r) => r.session_completed).length / valid.length;
  const avgQuestions   = avg(valid.map((r) => r.questions_asked));

  // Per-risk confusion matrix
  const RISK_LEVELS = ['low', 'medium', 'high', 'critical', 'unknown'];
  const confMatrix  = {};
  for (const expected of RISK_LEVELS) {
    confMatrix[expected] = {};
    for (const predicted of RISK_LEVELS) confMatrix[expected][predicted] = 0;
  }
  for (const r of valid) {
    const exp  = (r.expected_risk  || 'unknown').toLowerCase();
    const pred = (r.predicted_risk || 'unknown').toLowerCase();
    if (confMatrix[exp] && confMatrix[exp][pred] !== undefined) {
      confMatrix[exp][pred]++;
    }
  }

  // Per-source metrics
  const sources = [...new Set(valid.map((r) => r.source))];
  const perSource = {};
  for (const src of sources) {
    const sv = valid.filter((r) => r.source === src);
    perSource[src] = {
      count:            sv.length,
      risk_accuracy:    sv.filter((r) => r.risk_correct).length / sv.length,
      symptom_f1:       avg(sv.map((r) => r.symptom_metrics.f1)),
      department_score: avg(sv.map((r) => r.department_score)),
      keyword_coverage: avg(sv.map((r) => r.keyword_coverage)),
    };
  }

  // Per-category risk accuracy
  const categories = [...new Set(valid.map((r) => r.category))];
  const perCategory = {};
  for (const cat of categories) {
    const cv = valid.filter((r) => r.category === cat);
    perCategory[cat] = {
      count:         cv.length,
      risk_accuracy: cv.filter((r) => r.risk_correct).length / cv.length,
      symptom_f1:    avg(cv.map((r) => r.symptom_metrics.f1)),
    };
  }

  const summary = {
    generated_at:      new Date().toISOString(),
    total_cases:       cases.length,
    evaluated:         valid.length,
    errors:            results.filter((r) => r.error).length,
    total_duration_ms: totalTime,
    metrics: {
      symptom_extraction: {
        precision: +symPrecision.toFixed(4),
        recall:    +symRecall.toFixed(4),
        f1:        +symF1.toFixed(4),
      },
      clinical_entity_extraction: {
        overall_accuracy: +entityAcc.toFixed(4),
      },
      risk_classification: {
        accuracy:         +riskAcc.toFixed(4),
        confusion_matrix: confMatrix,
      },
      department_routing: {
        overall_accuracy: +deptAcc.toFixed(4),
      },
      conversation_quality: {
        avg_questions_asked:    +avgQuestions.toFixed(2),
        repeat_question_rate:   +repeatRate.toFixed(4),
        context_retention_rate: +contextRate.toFixed(4),
        session_completion_rate: +completionRate.toFixed(4),
      },
      summary_generation: {
        keyword_coverage: +kwCov.toFixed(4),
      },
      performance: {
        avg_latency_ms:       +avgLatency.toFixed(1),
        total_duration_ms:    totalTime,
        cases_per_second:     +(valid.length / (totalTime / 1000)).toFixed(2),
      },
    },
    per_source:   perSource,
    per_category: perCategory,
  };

  // ─── Write outputs ───────────────────────────────────────────────────────────

  fs.writeFileSync(
    path.join(REPORTS_DIR, 'evaluation_results.json'),
    JSON.stringify({ summary, results }, null, 2)
  );
  fs.writeFileSync(
    path.join(REPORTS_DIR, 'confusion_matrix.json'),
    JSON.stringify({ generated_at: new Date().toISOString(), matrix: confMatrix }, null, 2)
  );

  // CSV export
  const csvRows = [
    'id,source,category,expected_risk,predicted_risk,risk_correct,dept_score,sym_f1,sym_precision,sym_recall,entity_acc,kw_coverage,questions_asked,repeated_questions,context_retained,session_completed,latency_ms'
  ];
  for (const r of valid) {
    csvRows.push([
      r.id, r.source, `"${r.category}"`, r.expected_risk, r.predicted_risk,
      r.risk_correct ? 1 : 0,
      r.department_score.toFixed(3),
      r.symptom_metrics.f1.toFixed(3),
      r.symptom_metrics.precision.toFixed(3),
      r.symptom_metrics.recall.toFixed(3),
      r.entity_metrics.accuracy.toFixed(3),
      r.keyword_coverage.toFixed(3),
      r.questions_asked,
      r.repeated_questions,
      r.context_retained ? 1 : 0,
      r.session_completed ? 1 : 0,
      r.latency_ms,
    ].join(','));
  }
  fs.writeFileSync(path.join(REPORTS_DIR, 'evaluation_results.csv'), csvRows.join('\n'));

  // ─── Print summary ───────────────────────────────────────────────────────────

  console.log(`\n${'═'.repeat(50)}`);
  console.log('EVALUATION RESULTS');
  console.log('═'.repeat(50));
  console.log(`Evaluated     : ${valid.length}/${cases.length} cases`);
  console.log(`Duration      : ${(totalTime / 1000).toFixed(1)}s`);
  console.log('\nSymptom Extraction:');
  console.log(`  Precision   : ${(symPrecision * 100).toFixed(1)}%`);
  console.log(`  Recall      : ${(symRecall * 100).toFixed(1)}%`);
  console.log(`  F1 Score    : ${(symF1 * 100).toFixed(1)}%`);
  console.log('\nRisk Classification:');
  console.log(`  Accuracy    : ${(riskAcc * 100).toFixed(1)}%`);
  console.log('\nDepartment Routing:');
  console.log(`  Accuracy    : ${(deptAcc * 100).toFixed(1)}%`);
  console.log('\nConversation Quality:');
  console.log(`  Avg Q asked : ${avgQuestions.toFixed(1)}`);
  console.log(`  Repeat rate : ${(repeatRate * 100).toFixed(1)}%`);
  console.log(`  Context ret.: ${(contextRate * 100).toFixed(1)}%`);
  console.log(`  Completion  : ${(completionRate * 100).toFixed(1)}%`);
  console.log('\nSummary Generation:');
  console.log(`  KW Coverage : ${(kwCov * 100).toFixed(1)}%`);
  console.log('\nOutputs written to evaluation/reports/');

  return summary;
}

main().catch((e) => { console.error(e); process.exit(1); });
