/**
 * utils/parseJson.js — Robust JSON parser for LLM responses
 *
 * LLMs frequently wrap JSON in markdown code fences or add prose.
 * This utility strips all of that and returns parsed JSON or throws.
 */

function repairTruncatedJson(str) {
  let s = str.trim().replace(/,\s*$/, '');
  const stack = [];
  let inString = false;
  let escaped = false;

  for (const ch of s) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }

  while (stack.length) {
    const open = stack.pop();
    s += open === '{' ? '}' : ']';
  }
  return s;
}

/**
 * Parse JSON from an LLM response string.
 * Handles:
 *   - Plain JSON
 *   - ```json ... ``` fences
 *   - ``` ... ``` fences
 *   - JSON embedded in surrounding prose
 *
 * @param {string} text — Raw LLM output
 * @returns {object} Parsed JSON object
 * @throws {Error} If no valid JSON can be extracted
 */
function parseLLMJson(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('parseLLMJson: input must be a non-empty string');
  }

  let cleaned = text.trim();

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  // Try parsing directly first
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall through to extraction
  }

  // Try to extract the first JSON object or array from the text
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  const arrayMatch  = cleaned.match(/\[[\s\S]*\]/);
  const partialObject = !objectMatch ? cleaned.match(/\{[\s\S]*/)?.[0] : null;

  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      try {
        return JSON.parse(repairTruncatedJson(objectMatch[0]));
      } catch {
        // Fall through
      }
    }
  }

  if (partialObject) {
    try {
      return JSON.parse(repairTruncatedJson(partialObject));
    } catch {
      // Fall through
    }
  }

  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]);
    } catch {
      // Fall through
    }
  }

  throw new Error(`parseLLMJson: could not extract valid JSON from: ${text.slice(0, 200)}`);
}

module.exports = { parseLLMJson };
