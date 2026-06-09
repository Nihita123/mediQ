/**
 * middleware/errorMiddleware.js — Centralised error handling
 */

/**
 * notFound — catches requests to undefined routes.
 */
const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * errorHandler — global error handler.
 * Returns a consistent JSON error shape across the API.
 */
const errorHandler = (err, req, res, next) => {
  // Default to 500 if status code is still 200 (unhandled throw)
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    return res.status(400).json({
      message: 'Resource not found — invalid ID format',
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      message: `A record with that ${field} already exists`,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      message: messages.join(', '),
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }

  res.status(statusCode).json({
    message: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

module.exports = { notFound, errorHandler };
