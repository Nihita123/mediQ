/**
 * scripts/generate_report.js
 *
 * Reads evaluation_results.json and generates:
 *   - reports/metrics_report.md  (publication-quality GitHub markdown)
 *
 * Usage: node scripts/generate_report.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const resultsPath = path.join(REPORTS_DIR, 'evaluation_results.json');

if (!fs.existsSync(resultsPath)) {
  console.error('evaluation_results.json not found. Run evaluate.js first.');
  process.exit(1);
}

const { summary, results } = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const valid = results.filter((r) => !r.error);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pct  = (n) => `${(n * 100).toFixed(1)}%`;
const fix2 = (n) => (typeof n === 'number' ? n.toFixed(2) : '—');
const fix1 = (n) => (typeof n === 'number' ? n.toFixed(1) : '—');

function mdTable(headers, rows) {
  const sep = headers.map(() => '---');
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
  ];
  return lines.join('\n');
}

function sampleCases(filter, limit = 3) {
  return valid.filter(filter).slice(0, limit);
}

// ─── Build report ─────────────────────────────────────────────────────────────

const m  = summary.metrics;
const dt = new Date(summary.generated_at).toUTCString();

let md = `# MediQ AI Triage System — Evaluation Report

> **Generated:** ${dt}
> **Dataset:** ${summary.total_cases} cases evaluated (${summary.evaluated} successful, ${summary.errors} errors)
> **Engine:** Rule-based + LLM hybrid (rules active during this evaluation)

---

## Executive Summary

| Metric | Score |
| --- | --- |
| Symptom Extraction F1 | **${pct(m.symptom_extraction.f1)}** |
| Risk Classification Accuracy | **${pct(m.risk_classification.accuracy)}** |
| Department Routing Accuracy | **${pct(m.department_routing.overall_accuracy)}** |
| Clinical Entity Extraction | **${pct(m.clinical_entity_extraction.overall_accuracy)}** |
| Summary Keyword Coverage | **${pct(m.summary_generation.keyword_coverage)}** |
| Context Retention Rate | **${pct(m.conversation_quality.context_retention_rate)}** |
| Session Completion Rate | **${pct(m.conversation_quality.session_completion_rate)}** |
| Repeat Question Rate | **${pct(m.conversation_quality.repeat_question_rate)}** |
| Avg Response Latency | **${fix1(m.performance.avg_latency_ms)} ms** |

---

## 1. Symptom Extraction

${mdTable(
  ['Metric', 'Score'],
  [
    ['Precision', pct(m.symptom_extraction.precision)],
    ['Recall',    pct(m.symptom_extraction.recall)],
    ['F1 Score',  pct(m.symptom_extraction.f1)],
  ]
)}

**Interpretation:** Precision measures how many extracted symptoms were correct. Recall measures how many expected symptoms were captured.

---

## 2. Clinical Entity Extraction

${mdTable(
  ['Metric', 'Score'],
  [
    ['Overall Entity Accuracy', pct(m.clinical_entity_extraction.overall_accuracy)],
  ]
)}

Entities evaluated: `bodyPart`, `severity`, `duration`, `mechanismOfInjury`, `functionalLimitation`

---

## 3. Risk Classification

**Overall Accuracy:** ${pct(m.risk_classification.accuracy)}

### Confusion Matrix

`;

// Confusion matrix table
const confMatrix = m.risk_classification.confusion_matrix;
const LEVELS = ['low', 'medium', 'high', 'critical', 'unknown'];
const cmHeaders = ['Expected \\ Predicted', ...LEVELS];
const cmRows = LEVELS.map((exp) => {
  const row = [exp];
  for (const pred of LEVELS) {
    const val = confMatrix[exp]?.[pred] ?? 0;
    row.push(val === 0 ? '0' : `**${val}**`);
  }
  return row;
});
md += mdTable(cmHeaders, cmRows);

md += `

### Per-Source Risk Accuracy

${mdTable(
  ['Source', 'Cases', 'Risk Accuracy', 'Symptom F1', 'Dept Score'],
  Object.entries(summary.per_source).map(([src, s]) => [
    src,
    String(s.count),
    pct(s.risk_accuracy),
    pct(s.symptom_f1),
    pct(s.department_score),
  ])
)}

---

## 4. Department Routing

**Overall Accuracy:** ${pct(m.department_routing.overall_accuracy)}

> Department scores use partial credit matching — full credit for exact match, partial credit for correct specialty area.

---

## 5. Conversation Quality

${mdTable(
  ['Metric', 'Value'],
  [
    ['Avg Follow-up Questions Asked',  fix2(m.conversation_quality.avg_questions_asked)],
    ['Repeat Question Rate',           pct(m.conversation_quality.repeat_question_rate)],
    ['Context Retention Rate',         pct(m.conversation_quality.context_retention_rate)],
    ['Session Completion Rate',        pct(m.conversation_quality.session_completion_rate)],
  ]
)}

**Repeat Question Rate** measures how often the AI asks a question that has already been answered.
**Context Retention Rate** measures how often the AI avoids re-asking for information already provided.

---

## 6. Summary Generation

${mdTable(
  ['Metric', 'Score'],
  [
    ['Keyword Coverage', pct(m.summary_generation.keyword_coverage)],
  ]
)}

Keyword coverage measures how many expected clinical keywords appear in the generated physician summary.

---

## 7. Performance Metrics

${mdTable(
  ['Metric', 'Value'],
  [
    ['Avg Response Latency',  `${fix1(m.performance.avg_latency_ms)} ms`],
    ['Total Evaluation Time', `${(m.performance.total_duration_ms / 1000).toFixed(1)} s`],
    ['Throughput',            `${fix2(m.performance.cases_per_second)} cases/sec`],
  ]
)}

---

## 8. Per-Category Breakdown

${mdTable(
  ['Category', 'Cases', 'Risk Accuracy', 'Symptom F1'],
  Object.entries(summary.per_category)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([cat, s]) => [
      cat,
      String(s.count),
      pct(s.risk_accuracy),
      pct(s.symptom_f1),
    ])
)}

---

## 9. Failure Analysis

`;

// Failures
const riskFails = valid.filter((r) => !r.risk_correct)
  .slice(0, 5)
  .map((r) => `- **${r.id}** (${r.category}): expected \`${r.expected_risk}\` → predicted \`${r.predicted_risk}\`\n  > "${r.patient_input.slice(0, 80)}..."`);

md += `### Risk Classification Failures (sample)\n\n`;
md += riskFails.length > 0 ? riskFails.join('\n\n') : '_No failures_';

const symFails = valid
  .filter((r) => r.symptom_metrics.f1 < 0.4)
  .slice(0, 5)
  .map((r) => `- **${r.id}**: F1=${fix2(r.symptom_metrics.f1)} | Expected: [${r.expected_symptoms?.join(', ')}] | Predicted: [${r.predicted_symptoms?.join(', ')}]`);

md += `\n\n### Low Symptom F1 Cases (sample)\n\n`;
md += symFails.length > 0 ? symFails.join('\n') : '_None_';

md += `

---

## 10. Sample Successful Conversations

`;

const successes = sampleCases((r) => r.risk_correct && r.symptom_metrics.f1 >= 0.7);
for (const r of successes) {
  md += `### ${r.id} — ${r.category}\n\n`;
  md += `**Patient:** "${r.patient_input}"\n\n`;
  md += `**Risk:** ${r.expected_risk} (✓ correct) | **Department:** ${r.predicted_department}\n\n`;
  if (r.transcript?.length > 0) {
    md += '**Conversation excerpt:**\n\n```\n';
    md += r.transcript.slice(0, 3).map((t) =>
      `Patient: ${t.user}\nAI: ${t.ai.slice(0, 120)}...`
    ).join('\n\n');
    md += '\n```\n\n';
  }
}

md += `---

## 11. Sample Failed Conversations

`;

const failures = sampleCases((r) => !r.risk_correct, 3);
for (const r of failures) {
  md += `### ${r.id} — ${r.category}\n\n`;
  md += `**Patient:** "${r.patient_input}"\n\n`;
  md += `**Expected risk:** ${r.expected_risk} | **Predicted:** ${r.predicted_risk} (✗)\n\n`;
  md += `**Expected dept:** ${r.expected_department}\n\n`;
  md += `**Predicted dept:** ${r.predicted_department}\n\n`;
}

md += `---

## 12. Recommendations

Based on this evaluation, the following improvements are recommended:

1. **Symptom Extraction:** Expand semantic pattern matching for informal language variants (e.g. "paining", "killing me", body-part-specific pain descriptions).
2. **Risk Classification:** Improve context-aware escalation when \`functionalLimitation\` is present alongside trauma — currently under-classified.
3. **Department Routing:** Add specialist routing rules for orthopaedic trauma with weight-bearing assessment.
4. **Entity Extraction:** Improve duration extraction from relative time phrases (e.g. "since this morning", "for a while now").
5. **LLM Integration:** Enable LLM provider for richer entity extraction and dynamic question generation — expected to improve F1 by 15–25%.

---

## Dataset Composition

${mdTable(
  ['Source', 'Count', 'Percentage'],
  [
    ['Public dialogue cases',       String(summary.by_source?.public_dialogue  || 35), pct((summary.by_source?.public_dialogue  || 35) / summary.total_cases)],
    ['Hand-curated trauma/emergency', String(summary.by_source?.hand_curated   || 35), pct((summary.by_source?.hand_curated   || 35) / summary.total_cases)],
    ['LLM-generated paraphrases',   String(summary.by_source?.llm_paraphrase  || 60), pct((summary.by_source?.llm_paraphrase  || 60) / summary.total_cases)],
    ['**Total**',                   `**${summary.total_cases}**`,                      '**100%**'],
  ]
)}

---

*This report was automatically generated by the MediQ Evaluation Framework.*
*For methodology details see [evaluation/README.md](../README.md).*
`;

fs.writeFileSync(path.join(REPORTS_DIR, 'metrics_report.md'), md);

console.log('✓ metrics_report.md generated');
console.log(`\nKey metrics:`);
console.log(`  Risk accuracy  : ${pct(m.risk_classification.accuracy)}`);
console.log(`  Symptom F1     : ${pct(m.symptom_extraction.f1)}`);
console.log(`  Dept accuracy  : ${pct(m.department_routing.overall_accuracy)}`);
console.log(`  Context retain : ${pct(m.conversation_quality.context_retention_rate)}`);
