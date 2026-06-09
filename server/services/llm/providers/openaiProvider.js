/**
 * services/llm/providers/openaiProvider.js
 *
 * OpenAI-compatible provider (works with OpenAI API and any
 * OpenAI-compatible endpoint such as Azure OpenAI, Together AI, etc.)
 */

const OpenAI = require('openai');

let _client = null;

/**
 * Lazily initialise the OpenAI client.
 * @returns {OpenAI}
 */
function getClient() {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }
    _client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined, // Allows custom base URL
    });
  }
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
 * Rejects the obvious placeholder value 'sk-...'.
 * @returns {boolean}
 */
function isAvailable() {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key) && key !== 'sk-...' && key.startsWith('sk-');
}

module.exports = { chat, isAvailable, name: 'openai' };
