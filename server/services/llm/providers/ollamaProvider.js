/**
 * services/llm/providers/ollamaProvider.js
 *
 * Local Ollama provider via HTTP API.
 * Ollama exposes an OpenAI-compatible /api/chat endpoint.
 *
 * Default URL: http://localhost:11434
 * Set OLLAMA_URL in .env to override.
 */

const axios = require('axios');

/**
 * Send a chat request to a local Ollama instance.
 *
 * @param {object} params
 * @param {Array<{role: string, content: string}>} params.messages
 * @param {string} [params.model]
 * @param {number} [params.temperature]
 * @param {number} [params.maxTokens]
 * @returns {Promise<string>}
 */
async function chat({ messages, model, temperature = 0.3, maxTokens = 1500 }) {
  const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const modelName = model || process.env.OLLAMA_MODEL || 'llama3';

  const response = await axios.post(
    `${baseUrl}/api/chat`,
    {
      model: modelName,
      messages,
      stream: false,
      options: {
        temperature,
        num_predict: maxTokens,
      },
    },
    {
      timeout: 60000, // Ollama can be slow on first load
      headers: { 'Content-Type': 'application/json' },
    }
  );

  const content = response.data?.message?.content;
  if (!content) {
    throw new Error('Ollama returned an empty response');
  }

  return content.trim();
}

/**
 * Check if Ollama is configured and reachable.
 * Returns true if OLLAMA_URL or OLLAMA_MODEL is set — actual
 * connectivity is checked at call time.
 * @returns {boolean}
 */
function isAvailable() {
  return Boolean(process.env.OLLAMA_URL || process.env.OLLAMA_MODEL);
}

module.exports = { chat, isAvailable, name: 'ollama' };
