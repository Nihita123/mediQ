/**
 * utils/formatters.js — Shared formatting helpers
 */

/**
 * Format a date string into a human-readable form.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

/**
 * Format a date with time.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDateTime(date) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

/**
 * Return a colour class based on risk level.
 * @param {'low'|'medium'|'high'|'critical'|'unknown'} level
 * @returns {string} Tailwind CSS classes
 */
export function riskLevelClass(level) {
  const map = {
    low: 'bg-green-100 text-green-700 border-green-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    high: 'bg-red-100 text-red-700 border-red-200',
    critical: 'bg-purple-100 text-purple-700 border-purple-200',
    unknown: 'bg-gray-100 text-gray-600 border-gray-200',
  };
  return map[level] || map.unknown;
}

/**
 * Return a dot colour class for risk badge.
 * @param {string} level
 * @returns {string}
 */
export function riskDotClass(level) {
  const map = {
    low: 'bg-green-500',
    medium: 'bg-yellow-500',
    high: 'bg-red-500',
    critical: 'bg-purple-600',
    unknown: 'bg-gray-400',
  };
  return map[level] || map.unknown;
}

/**
 * Capitalise the first letter of a string.
 * @param {string} str
 * @returns {string}
 */
export function capitalise(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
