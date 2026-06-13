/**
 * scripts/build_dataset.js
 *
 * Merges the three dataset sources into master_evaluation_dataset.json
 * and generates category_distribution.json and dataset_statistics.json.
 *
 * Usage: node scripts/build_dataset.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DATASETS_DIR = path.join(__dirname, '..', 'datasets');
const REPORTS_DIR  = path.join(__dirname, '..', 'reports');

// ─── Load sources ─────────────────────────────────────────────────────────────

function loadJSON(filename) {
  const fp = path.join(DATASETS_DIR, filename);
  if (!fs.existsSync(fp)) {
    console.error(`Missing dataset file: ${fp}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

const publicCases   = loadJSON('public_dialogue_cases.json');
const traumaCases   = loadJSON('trauma_emergency_cases.json');
const paraphrased   = loadJSON('paraphrased_cases.json');

console.log(`Loaded ${publicCases.length} public dialogue cases`);
console.log(`Loaded ${traumaCases.length} trauma/emergency cases`);
console.log(`Loaded ${paraphrased.length} paraphrased cases`);

// ─── Validate schema ──────────────────────────────────────────────────────────

const REQUIRED_FIELDS = [
  'id', 'source', 'category', 'patient_input',
  'expected_symptoms', 'expected_entities',
  'expected_risk', 'expected_department', 'expected_summary_keywords',
];

function validateCase(c, idx) {
  const issues = [];
  for (const f of REQUIRED_FIELDS) {
    if (c[f] === undefined || c[f] === null) issues.push(`missing field: ${f}`);
  }
  if (!c.patient_input || c.patient_input.trim().length < 5) issues.push('patient_input too short');
  if (!['low','medium','high','critical','unknown'].includes(c.expected_risk)) {
    issues.push(`invalid expected_risk: ${c.expected_risk}`);
  }
  return issues;
}

// ─── Duplicate detection ──────────────────────────────────────────────────────

function detectDuplicates(cases) {
  const seenIds     = new Map();
  const seenInputs  = new Map();
  const duplicates  = [];

  for (const c of cases) {
    if (seenIds.has(c.id)) {
      duplicates.push({ type: 'duplicate_id', id: c.id });
    } else {
      seenIds.set(c.id, true);
    }

    const norm = c.patient_input.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seenInputs.has(norm)) {
      duplicates.push({ type: 'duplicate_input', id: c.id, matches: seenInputs.get(norm) });
    } else {
      seenInputs.set(norm, c.id);
    }
  }

  return duplicates;
}

// ─── Build master dataset ─────────────────────────────────────────────────────

const allCases = [...publicCases, ...traumaCases, ...paraphrased];

// Validate all
let validationErrors = 0;
for (const [i, c] of allCases.entries()) {
  const issues = validateCase(c, i);
  if (issues.length > 0) {
    console.warn(`  [WARN] Case ${c.id}: ${issues.join('; ')}`);
    validationErrors++;
  }
}

const duplicates = detectDuplicates(allCases);
if (duplicates.length > 0) {
  console.warn(`\nFound ${duplicates.length} potential duplicates:`);
  duplicates.forEach((d) => console.warn(`  ${JSON.stringify(d)}`));
}

console.log(`\nValidation: ${validationErrors} issues found across ${allCases.length} cases`);

// ─── Category distribution ────────────────────────────────────────────────────

const catMap = {};
for (const c of allCases) {
  const cat = c.category || 'Unknown';
  if (!catMap[cat]) catMap[cat] = { total: 0, by_source: {} };
  catMap[cat].total++;
  catMap[cat].by_source[c.source] = (catMap[cat].by_source[c.source] || 0) + 1;
}

const riskMap = { low: 0, medium: 0, high: 0, critical: 0, unknown: 0 };
for (const c of allCases) riskMap[c.expected_risk]++;

const sourceMap = {};
for (const c of allCases) {
  sourceMap[c.source] = (sourceMap[c.source] || 0) + 1;
}

// ─── Statistics ───────────────────────────────────────────────────────────────

const stats = {
  generated_at:       new Date().toISOString(),
  total_cases:        allCases.length,
  by_source: {
    public_dialogue:  publicCases.length,
    hand_curated:     traumaCases.length,
    llm_paraphrase:   paraphrased.length,
  },
  by_risk_level:      riskMap,
  validation_errors:  validationErrors,
  duplicate_count:    duplicates.length,
  unique_categories:  Object.keys(catMap).length,
};

// ─── Write outputs ────────────────────────────────────────────────────────────

fs.writeFileSync(
  path.join(DATASETS_DIR, 'master_evaluation_dataset.json'),
  JSON.stringify(allCases, null, 2)
);

fs.writeFileSync(
  path.join(DATASETS_DIR, 'category_distribution.json'),
  JSON.stringify({ generated_at: new Date().toISOString(), categories: catMap }, null, 2)
);

fs.writeFileSync(
  path.join(DATASETS_DIR, 'dataset_statistics.json'),
  JSON.stringify(stats, null, 2)
);

fs.writeFileSync(
  path.join(DATASETS_DIR, 'duplicate_report.json'),
  JSON.stringify({ generated_at: new Date().toISOString(), duplicates }, null, 2)
);

console.log('\n✓ master_evaluation_dataset.json');
console.log('✓ category_distribution.json');
console.log('✓ dataset_statistics.json');
console.log('✓ duplicate_report.json');
console.log(`\nDataset summary:`);
console.log(`  Total cases  : ${stats.total_cases}`);
console.log(`  Public       : ${stats.by_source.public_dialogue}`);
console.log(`  Hand-curated : ${stats.by_source.hand_curated}`);
console.log(`  Paraphrased  : ${stats.by_source.llm_paraphrase}`);
console.log(`  Risk — critical: ${riskMap.critical} | high: ${riskMap.high} | medium: ${riskMap.medium} | low: ${riskMap.low}`);
