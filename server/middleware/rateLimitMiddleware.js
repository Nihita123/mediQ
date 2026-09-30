/**
 * middleware/rateLimitMiddleware.js — Express rate limiting
 *
 * Applies per-route rate limits to protect auth and LLM endpoints.
 * Limits are configurable via environment variables for easy tuning.
 */

const rateLimit = require('express-rate-limit');

/**
 * Build a standard rate-limit response that matches the project's
 * existing JSON error shape: { message: "..." }
 */
function buildHandler(message) {
  return (_req, res) => {
    res.status(429).json({ message });
  };
}

// ─── Login ────────────────────────────────────────────────────────────────────
// Strict: prevents brute-force attacks on credentials.
const loginLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LOGIN_WINDOW_MS  || '900000'), // 15 min
  max:      parseInt(process.env.RATE_LOGIN_MAX        || '10'),
  standardHeaders: true,
  legacyHeaders:   false,
  handler: buildHandler('Too many login attempts. Please wait 15 minutes and try again.'),
});

// ─── Register ─────────────────────────────────────────────────────────────────
// Moderate: prevents account-creation spam.
const registerLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_REGISTER_WINDOW_MS || '3600000'), // 1 hour
  max:      parseInt(process.env.RATE_REGISTER_MAX       || '5'),
  standardHeaders: true,
  legacyHeaders:   false,
  handler: buildHandler('Too many accounts created from this IP. Please try again later.'),
});

// ─── Triage start ─────────────────────────────────────────────────────────────
// Each start call creates a DB document; LLM call happens on first message.
const triageStartLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_TRIAGE_START_WINDOW_MS || '3600000'), // 1 hour
  max:      parseInt(process.env.RATE_TRIAGE_START_MAX       || '10'),
  standardHeaders: true,
  legacyHeaders:   false,
  handler: buildHandler('Too many triage sessions started. Please wait before starting a new session.'),
});

// ─── Triage message ───────────────────────────────────────────────────────────
// Each message may trigger an LLM call — this is the most important limit.
const triageMessageLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_TRIAGE_MSG_WINDOW_MS || '60000'), // 1 min
  max:      parseInt(process.env.RATE_TRIAGE_MSG_MAX       || '20'),
  standardHeaders: true,
  legacyHeaders:   false,
  handler: buildHandler('You are sending messages too quickly. Please wait a moment and try again.'),
});

module.exports = {
  loginLimiter,
  registerLimiter,
  triageStartLimiter,
  triageMessageLimiter,
};
