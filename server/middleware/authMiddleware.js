/**
 * middleware/authMiddleware.js — JWT authentication & role-based access control
 */

const jwt = require('jsonwebtoken');
const User = require('../models/userModel');

/**
 * protect — Verifies the JWT from the Authorization header.
 * Attaches the decoded user to req.user on success.
 */
const protect = async (req, res, next) => {
  let token;

  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized — no token provided' });
  }

  try {
    // Verify token signature and expiry
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach the user (without password) to the request
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized — user no longer exists' });
    }

    if (!req.user.isActive) {
      return res.status(401).json({ message: 'Not authorized — account is deactivated' });
    }

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Not authorized — token has expired' });
    }
    return res.status(401).json({ message: 'Not authorized — invalid token' });
  }
};

/**
 * authorizeRoles — Restricts access to specified roles.
 * Must be used AFTER the protect middleware.
 *
 * Usage: router.get('/admin', protect, authorizeRoles('admin'), handler)
 *
 * @param {...string} roles — Allowed roles
 */
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied — role '${req.user.role}' is not permitted to access this resource`,
      });
    }
    next();
  };
};

module.exports = { protect, authorizeRoles };
