/**
 * scripts/validate_dataset.js
 *
 * Validates the master dataset for schema completeness and data quality.
 * Usage: node scripts/validate_dataset.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const masterPath = path.join(__dirname, '..', 'datasets', 'master_evaluation_dataset.json');

if (!fs.existsSync(masterPath)) {
  console.error('master_evaluation_dataset.json not found. Run build_dataset.js first.');
  process.exit(1);
}

const cases = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
console.log(`Validating ${cases.length} cases...\n`);

const VALID_RISKS    = ['low', 'medium', 'high', 'critical', 'unknown'];
const VALID_SOURCES  = ['provided_dataset', 'hand_curated', 'llm_paraphrase'];

let errors = 0, warnings = 0;

function err(id, msg)  { console.error(`  [ERROR] ${id}: ${msg}`);   errors++; }
function warn(id, msg) { console.warn(`  [WARN]  ${id}: ${msg}`);    warnings++; }

for (const c of cases) {
  // Required fields
  if (!c.id)            err(c.id || '?', 'missing id');
  if (!c.source)        err(c.id, 'missing source');
  if (!c.category)      warn(c.id, 'missing category');
  if (!c.patient_input) err(c.id, 'missing patient_input');
  if (!c.expected_risk) err(c.id, 'missing expected_risk');
  if (!c.expected_department) warn(c.id, 'missing expected_department');

  // Value validation
  if (c.source && !VALID_SOURCES.includes(c.source)) {
    warn(c.id, `unknown source: ${c.source}`);
  }
  if (c.expected_risk && !VALID_RISKS.includes(c.expected_risk)) {
    err(c.id, `invalid expected_risk: ${c.expected_risk}`);
  }
  if (!Array.isArray(c.expected_symptoms)) {
    err(c.id, 'expected_symptoms must be an array');
  }
  if (!Array.isArray(c.expected_summary_keywords)) {
    warn(c.id, 'expected_summary_keywords missing or not array');
  }

  // Quality checks
  if (c.patient_input && c.patient_input.trim().length < 8) {
    warn(c.id, 'patient_input is very short (< 8 chars)');
  }
  if (c.expected_symptoms && c.expected_symptoms.length === 0) {
    warn(c.id, 'expected_symptoms is empty');
  }
  if (c.expected_entities) {
    const e = c.expected_entities;
    const entityFields = ['bodyPart','severity','duration','mechanismOfInjury','functionalLimitation','associatedSymptoms'];
    for (const f of entityFields) {
      if (!(f in e)) warn(c.id, `expected_entities missing field: ${f}`);
    }
  } else {
    err(c.id, 'missing expected_entities object');
  }

  // Paraphrase parent check
  if (c.source === 'llm_paraphrase' && !c.parent_id) {
    warn(c.id, 'paraphrase case missing parent_id');
  }
}

// Duplicate IDs
const ids = cases.map((c) => c.id);
const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupIds.length > 0) {
  console.error(`\nDuplicate IDs found: ${dupIds.join(', ')}`);
  errors += dupIds.length;
}

// Summary
console.log(`\nValidation complete:`);
console.log(`  ${cases.length} cases checked`);
console.log(`  ${errors} errors`);
console.log(`  ${warnings} warnings`);

if (errors > 0) {
  console.error('\nDataset has errors — fix before running evaluation.');
  process.exit(1);
} else {
  console.log('\n✓ Dataset is valid and ready for evaluation.');
}
