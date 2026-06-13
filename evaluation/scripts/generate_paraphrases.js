/**
 * scripts/generate_paraphrases.js
 *
 * Generates additional paraphrases using the configured LLM provider.
 * Falls back to printing instructions if no LLM is configured.
 *
 * Usage: node scripts/generate_paraphrases.js [--count 10] [--source hand_curated]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DATASETS_DIR  = path.join(__dirname, '..', 'datasets');
const MASTER_PATH   = path.join(DATASETS_DIR, 'master_evaluation_dataset.json');
const PARAPH_PATH   = path.join(DATASETS_DIR, 'paraphrased_cases.json');

// Parse CLI args
const args    = process.argv.slice(2);
const countArg  = args.indexOf('--count');
const sourceArg = args.indexOf('--source');
const TARGET_COUNT  = countArg !== -1  ? parseInt(args[countArg + 1])  : 5;
const FILTER_SOURCE = sourceArg !== -1 ? args[sourceArg + 1]           : 'hand_curated';

if (!fs.existsSync(MASTER_PATH)) {
  console.error('Run build_dataset.js first.');
  process.exit(1);
}

const master     = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));
const existing   = JSON.parse(fs.readFileSync(PARAPH_PATH, 'utf8'));
const candidates = master.filter((c) => c.source === FILTER_SOURCE);

console.log(`Found ${candidates.length} ${FILTER_SOURCE} cases to paraphrase.`);
console.log(`Generating ${TARGET_COUNT} new paraphrases...\n`);

// ─── Paraphrase template ──────────────────────────────────────────────────────

function buildParaphrasePrompt(originalInput) {
  return `You are generating training data for a medical NLP system.

Create 3 natural paraphrases of the following patient complaint.
Requirements:
- Preserve all clinical meaning exactly
- Change the wording, not the medical facts
- Use informal, conversational language
- Include 1 variant with minor spelling mistakes
- Include regional/colloquial expressions where natural

Original: "${originalInput}"

Return ONLY a JSON array of 3 strings:
["paraphrase 1", "paraphrase 2", "paraphrase 3"]`;
}

// ─── Try LLM or manual instructions ──────────────────────────────────────────

async function run() {
  // Attempt to use the server's LLM router
  let llmAvailable = false;
  let llmRouter;

  try {
    // Load server environment using server's dotenv
    const dotenvPath = path.join(__dirname, '..', '..', 'server', 'node_modules', 'dotenv');
    require(dotenvPath).config({ path: path.join(__dirname, '..', '..', 'server', '.env') });
    llmRouter = require('../../server/services/llm/llmRouter');
    llmAvailable = llmRouter.isLLMAvailable();
  } catch {
    console.log('Note: Server LLM router not accessible from this context.');
  }

  const newParaphrases = [];
  const nextId = existing.length + 1;

  if (llmAvailable) {
    console.log(`Using LLM provider: ${llmRouter.getProviderName()}\n`);

    for (let i = 0; i < Math.min(TARGET_COUNT, candidates.length); i++) {
      const source = candidates[i % candidates.length];
      process.stdout.write(`  Paraphrasing ${source.id}...`);

      try {
        const raw = await llmRouter.chat({
          messages: [
            { role: 'system', content: 'You generate paraphrases of medical patient complaints.' },
            { role: 'user',   content: buildParaphrasePrompt(source.patient_input) },
          ],
          temperature: 0.8,
          maxTokens: 500,
        });

        // Parse array response
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) {
          const variants = JSON.parse(match[0]);
          for (const [vi, variant] of variants.entries()) {
            const newCase = {
              id:          `PAR_GEN_${String(nextId + newParaphrases.length).padStart(3, '0')}`,
              source:      'llm_paraphrase',
              parent_id:   source.id,
              category:    source.category,
              patient_input: variant,
              expected_symptoms:         source.expected_symptoms,
              expected_entities:         source.expected_entities,
              expected_risk:             source.expected_risk,
              expected_department:       source.expected_department,
              expected_summary_keywords: source.expected_summary_keywords,
            };
            newParaphrases.push(newCase);
          }
          console.log(` ✓ (${variants.length} variants)`);
        }
      } catch (err) {
        console.log(` ✗ ${err.message}`);
      }
    }
  } else {
    console.log('No LLM configured. Generating manual paraphrase templates instead.\n');
    console.log('To generate real paraphrases:');
    console.log('  1. Set OPENAI_API_KEY, GEMINI_API_KEY, or OLLAMA_URL in server/.env');
    console.log('  2. Run: node scripts/generate_paraphrases.js\n');
    console.log('Manual paraphrase instructions:');
    console.log('  For each case in trauma_emergency_cases.json:');
    console.log('  - Change symptom descriptions to informal language');
    console.log('  - Add colloquial expressions (e.g. "killing me", "cant take it")');
    console.log('  - Include 1 variant per case with minor spelling errors');
    console.log('  - Add to paraphrased_cases.json with source: "llm_paraphrase"\n');

    // Show sample templates for the first 3 cases
    for (const c of candidates.slice(0, 3)) {
      console.log(`\nCase ${c.id}: "${c.patient_input}"`);
      console.log('  Template variants:');
      console.log(`    1. [informal version]`);
      console.log(`    2. [regional expression version]`);
      console.log(`    3. [typo version]`);
    }
    process.exit(0);
  }

  if (newParaphrases.length > 0) {
    const updated = [...existing, ...newParaphrases];
    fs.writeFileSync(PARAPH_PATH, JSON.stringify(updated, null, 2));
    console.log(`\n✓ Added ${newParaphrases.length} new paraphrases to paraphrased_cases.json`);
    console.log('  Run build_dataset.js to rebuild the master dataset.');
  } else {
    console.log('\nNo new paraphrases were generated.');
  }
}

run().catch(console.error);
