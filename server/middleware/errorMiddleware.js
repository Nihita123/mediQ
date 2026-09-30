/**
 * middleware/errorMiddleware.js — Centralised error handling
 *
 * Production: returns clean messages only — no stack traces, paths, or
 * provider-specific details that could leak internal information.
 * Development: includes stack for easier debugging.
 */

const isDev = process.env.NODE_ENV !== 'production';

/**
 * notFound — catches requests to undefined routes.
 */
const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * sanitiseMessage — strips sensitive fragments from error messages
 * before sending them to the client in production.
 */
function sanitiseMessage(message) {
  if (!message) return 'Something went wrong. Please try again.';

  // Block messages that might leak internal details
  const SENSITIVE_PATTERNS = [
    /MONGO_URI/i,
    /JWT_SECRET/i,
    /API_KEY/i,
    /password/i,
    /C:\\/i,
    /\/home\//i,
    /node_modules/i,
    /ECONNREFUSED/i,
    /MongoServer/i,
    /MongoNetwork/i,
  ];

  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(message)) {
      return 'Something went wrong. Please try again.';
    }
  }

  return message;
}

/**
 * errorHandler — global error handler.
 * Returns a consistent JSON error shape across the API.
 */
const errorHandler = (err, req, res, _next) => {
  // Log the full error server-side for debugging (never sent to client)
  if (isDev) {
    console.error(`[Error] ${req.method} ${req.originalUrl} — ${err.message}`);
    if (err.stack) console.error(err.stack);
  } else {
    // Structured log without stack for production
    console.error(JSON.stringify({
      level:  'error',
      method: req.method,
      url:    req.originalUrl,
      status: res.statusCode,
      message: err.message,
      name:   err.name,
      timestamp: new Date().toISOString(),
    }));
  }

  // Default to 500 if status code is still 200 (unhandled throw)
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    return res.status(400).json({
      message: 'Resource not found — invalid ID format',
      ...(isDev && { stack: err.stack }),
    });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      message: `A record with that ${field} already exists`,
      ...(isDev && { stack: err.stack }),
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      message: messages.join(', '),
      ...(isDev && { stack: err.stack }),
    });
  }

  // JWT errors — already handled in authMiddleware, but catch any stragglers
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ message: 'Not authorized — invalid or expired token' });
  }

  // LLM / network errors — give a clean client message
  if (err.message?.includes('LLM') || err.message?.includes('GoogleGenerativeAI') || err.message?.includes('OpenAI')) {
    return res.status(503).json({
      message: 'AI service temporarily unavailable. The system will use rule-based triage.',
      ...(isDev && { detail: err.message }),
    });
  }

  res.status(statusCode).json({
    message: isDev ? err.message : sanitiseMessage(err.message),
    ...(isDev && { stack: err.stack }),
  });
};

module.exports = { notFound, errorHandler };
