/**
 * middleware/validateMiddleware.js — express-validator result handler
 *
 * Use after calling validationResult chains on routes.
 */

const { validationResult } = require('express-validator');

/**
 * validate — Reads express-validator errors and returns 400 if any exist.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }

  next();
};

module.exports = { validate };
