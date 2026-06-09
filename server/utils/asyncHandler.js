/**
 * utils/asyncHandler.js — Wraps async route handlers to forward errors
 * to Express's centralised error handler, eliminating repetitive try/catch.
 *
 * Usage:
 *   router.get('/route', asyncHandler(async (req, res) => { ... }))
 */

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
