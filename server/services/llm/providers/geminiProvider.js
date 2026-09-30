/**
 * services/llm/providers/geminiProvider.js
 *
 * Google Gemini provider via @google/generative-ai SDK.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

let _client = null;
let _lastRequestAt = 0;

/** Minimum gap between requests on free tier (~5 RPM) */
const MIN_INTERVAL_MS = 3000; // reduced from 12500 — let the caller handle rate limits

/** Maximum time to wait before a retry (cap retryDelayMs at this) */
const MAX_RETRY_DELAY_MS = 8000;

/** Maximum retries — keep low so we fail fast and fall back to rules */
const MAX_RETRIES = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle() {
  const now = Date.now();
  const wait = MIN_INTERVAL_MS - (now - _lastRequestAt);
  if (wait > 0) await sleep(wait);
  _lastRequestAt = Date.now();
}

function retryDelayMs(err) {
  const msg = err?.message || '';
  const match = msg.match(/retry in ([\d.]+)s/i);
  if (match) {
    // Cap at MAX_RETRY_DELAY_MS — don't wait 58s, just fail fast to rules
    return Math.min(Math.ceil(parseFloat(match[1]) * 1000) + 500, MAX_RETRY_DELAY_MS);
  }
  return 3000;
}

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
  const modelName = model || process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const { systemInstruction, history, lastUserMessage } = convertMessages(messages);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await throttle();

      const genAI = getClient();
      const generativeModel = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemInstruction || undefined,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      });

      const chatSession = generativeModel.startChat({ history });
      const result = await chatSession.sendMessage(lastUserMessage || 'Continue');

      const text = result.response?.text?.();
      if (!text) {
        throw new Error('Gemini returned an empty response');
      }

      return text.trim();
    } catch (err) {
      const msg = err?.message || '';
      const isRateLimit = msg.includes('429') || msg.includes('Too Many Requests') || msg.includes('quota');
      const isUnavailable = msg.includes('503') || msg.includes('Service Unavailable') || msg.includes('high demand');

      if ((isRateLimit || isUnavailable) && attempt < MAX_RETRIES - 1) {
        const delay = retryDelayMs(err);
        console.warn(`[Gemini] Rate limited — waiting ${delay}ms before retry ${attempt + 1}/${MAX_RETRIES}`);
        await sleep(delay);
        continue;
      }
      // On final attempt or non-retryable error, throw immediately
      throw err;
    }
  }
}

/**
 * Check if the Gemini provider is configured with a real key.
 * Accepts both AIza... (standard) and AQ... (AI Studio project) key formats.
 * @returns {boolean}
 */
function isAvailable() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.length < 20) return false;
  if (key === 'AIza...' || key.includes('your-key') || key.includes('placeholder')) return false;
  return key.startsWith('AIza') || key.startsWith('AQ.');
}

module.exports = { chat, isAvailable, name: 'gemini' };
