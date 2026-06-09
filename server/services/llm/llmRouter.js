/**
 * services/llm/llmRouter.js — Provider Abstraction Layer
 *
 * Selects the active LLM provider based on environment configuration.
 * Priority order:
 *   1. LLM_PROVIDER env var (explicit override)
 *   2. First provider with a valid API key / config
 *   3. Falls back to rule-based system if no provider is configured
 *
 * Usage:
 *   const llm = require('./llmRouter');
 *   const reply = await llm.chat({ messages: [...] });
 */

const openai  = require('./providers/openaiProvider');
const gemini  = require('./providers/geminiProvider');
const ollama  = require('./providers/ollamaProvider');

// Provider registry — checked in priority order
const PROVIDERS = [openai, gemini, ollama];

/**
 * Get the active provider instance.
 * @returns {{ chat: Function, name: string } | null}
 */
function getActiveProvider() {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();

  if (explicit) {
    const found = PROVIDERS.find((p) => p.name === explicit);
    if (found) return found;
    console.warn(`[LLM] LLM_PROVIDER="${explicit}" not found. Auto-detecting...`);
  }

  // Auto-detect: return first available provider
  return PROVIDERS.find((p) => p.isAvailable()) || null;
}

/**
 * Send a chat completion request through the active provider.
 *
 * @param {object} params
 * @param {Array<{role: 'system'|'user'|'assistant', content: string}>} params.messages
 * @param {string}  [params.model]        — Override the default model for this call
 * @param {number}  [params.temperature]  — 0.0–1.0, defaults to 0.3
 * @param {number}  [params.maxTokens]    — Max tokens to generate
 * @returns {Promise<string>} Raw text response from the LLM
 * @throws {Error} If no provider is configured or the call fails
 */
async function chat(params) {
  const provider = getActiveProvider();

  if (!provider) {
    throw new Error(
      'No LLM provider configured. Set OPENAI_API_KEY, GEMINI_API_KEY, or OLLAMA_URL in your .env file.'
    );
  }

  return provider.chat(params);
}

/**
 * Check whether any LLM provider is currently configured.
 * Used by the triage engine to decide whether to use LLM or rules.
 * @returns {boolean}
 */
function isLLMAvailable() {
  return getActiveProvider() !== null;
}

/**
 * Get the name of the currently active provider (for logging/debugging).
 * @returns {string}
 */
function getProviderName() {
  return getActiveProvider()?.name || 'none';
}

module.exports = { chat, isLLMAvailable, getProviderName };
