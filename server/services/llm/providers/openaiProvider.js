/**
 * services/llm/providers/openaiProvider.js
 *
 * OpenAI-compatible provider (works with OpenAI API and any
 * OpenAI-compatible endpoint such as Azure OpenAI, Together AI, etc.)
 */

const OpenAI = require('openai');

let _client = null;
let _clientKey = null; // track which key the client was built with

/**
 * Lazily initialise the OpenAI client.
 * Re-creates the client if the key has changed.
 * @returns {OpenAI}
 */
function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  if (_client && _clientKey === key) return _client;

  _client = new OpenAI({
    apiKey:  key,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  _clientKey = key;
  return _client;
}

/**
 * Send a chat completion request to the OpenAI API.
 *
 * @param {object} params
 * @param {Array<{role: string, content: string}>} params.messages
 * @param {string} [params.model]
 * @param {number} [params.temperature]
 * @param {number} [params.maxTokens]
 * @returns {Promise<string>} The assistant's reply text
 */
async function chat({ messages, model, temperature = 0.3, maxTokens = 1500 }) {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages,
    temperature,
    max_tokens: maxTokens,
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned an empty response');
  }

  return content.trim();
}

/**
 * Check if the OpenAI provider is configured with a real key.
 * Rejects placeholder/template values that would fail with a 401.
 * A real OpenAI key is 'sk-' followed by at least 20 alphanumeric chars
 * and contains no spaces, hyphens-after-prefix, or template words.
 * @returns {boolean}
 */
function isAvailable() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return false;
  if (!key.startsWith('sk-')) return false;

  // Reject obvious placeholders: sk-..., sk-your-..., sk-proj-...-here, etc.
  const PLACEHOLDER_PATTERNS = [
    /^sk-\.+$/,                  // sk-...
    /your/i,                     // sk-your-real-key-here
    /example/i,                  // sk-example
    /replace/i,                  // sk-replace-me
    /here$/i,                    // ends with "here"
    /^sk-.{1,10}$/,              // too short to be real (real keys are 50+ chars)
  ];

  return !PLACEHOLDER_PATTERNS.some((p) => p.test(key));
}

module.exports = { chat, isAvailable, name: 'openai' };
