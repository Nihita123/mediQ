/**
 * services/llm/providers/geminiProvider.js
 *
 * Google Gemini provider via @google/generative-ai SDK.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

let _client = null;

function getClient() {
  if (!_client) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set in environment variables');
    }
    _client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _client;
}

/**
 * Convert OpenAI-style messages array to Gemini format.
 * Gemini separates the system prompt from the conversation history.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @returns {{ systemInstruction: string, history: Array, lastUserMessage: string }}
 */
function convertMessages(messages) {
  let systemInstruction = '';
  const history = [];
  let lastUserMessage = '';

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'system') {
      systemInstruction = msg.content;
      continue;
    }

    // The last user message is sent as the current turn input
    if (msg.role === 'user' && i === messages.length - 1) {
      lastUserMessage = msg.content;
      continue;
    }

    // Map roles: 'assistant' → 'model'
    history.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }

  return { systemInstruction, history, lastUserMessage };
}

/**
 * Send a chat request to Google Gemini.
 *
 * @param {object} params
 * @param {Array<{role: string, content: string}>} params.messages
 * @param {string} [params.model]
 * @param {number} [params.temperature]
 * @param {number} [params.maxTokens]
 * @returns {Promise<string>}
 */
async function chat({ messages, model, temperature = 0.3, maxTokens = 1500 }) {
  const genAI = getClient();

  const modelName = model || process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const { systemInstruction, history, lastUserMessage } = convertMessages(messages);

  const generativeModel = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemInstruction || undefined,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  });

  const chat = generativeModel.startChat({ history });
  const result = await chat.sendMessage(lastUserMessage || 'Continue');

  const text = result.response?.text?.();
  if (!text) {
    throw new Error('Gemini returned an empty response');
  }

  return text.trim();
}

/**
 * Check if the Gemini provider is configured with a real key.
 * @returns {boolean}
 */
function isAvailable() {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key) && key !== 'AIza...' && key.startsWith('AIza');
}

module.exports = { chat, isAvailable, name: 'gemini' };
