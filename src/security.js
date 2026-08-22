'use strict';

const path = require('path');

/**
 * Validate that a resolved path stays within the allowed root directory.
 * Prevents path traversal attacks via symlinks or .. sequences.
 * @param {string} rootDir - The allowed root directory
 * @param {string} filePath - The path to validate
 * @returns {string} The resolved, validated absolute path
 * @throws {Error} If path escapes the root directory
 */
function safePath(rootDir, filePath) {
  const resolved = path.resolve(rootDir, filePath);
  const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep;

  if (resolved !== rootDir && !resolved.startsWith(rootWithSep)) {
    throw new Error(`Path traversal detected: ${filePath} resolves outside ${rootDir}`);
  }

  return resolved;
}

/**
 * Validate that a filename contains no path separators or dangerous characters.
 * @param {string} name - The filename to validate
 * @returns {boolean} True if the name is safe
 */
function isValidFilename(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return false;
  if (name.length === 0 || name.length > 255) return false;
  // Allow only alphanumeric, hyphen, underscore, dot
  return /^[a-zA-Z0-9._-]+$/.test(name);
}

/**
 * Sanitize a string for safe use in file paths and templates.
 * @param {string} input - The string to sanitize
 * @returns {string} The sanitized string
 */
function sanitizeString(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/[<>:"|?*]/g, '')
    .trim();
}

/**
 * Validate a URL string for Instagram or Facebook.
 * @param {string} url - The URL to validate
 * @returns {boolean} True if the URL is a valid Instagram or Facebook URL
 */
function isValidOutreachUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return (
      host === 'instagram.com' ||
      host === 'm.instagram.com' ||
      host === 'facebook.com' ||
      host === 'm.facebook.com' ||
      host === 'web.facebook.com' ||
      host === 'fb.com' ||
      host === 'fb.watch'
    );
  } catch {
    return false;
  }
}

/**
 * Validate and clamp a numeric config value.
 * @param {*} value - The value to validate
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @param {number} fallback - Default value if invalid
 * @returns {number} The validated and clamped value
 */
function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

module.exports = {
  safePath,
  isValidFilename,
  sanitizeString,
  isValidOutreachUrl,
  clampNumber
};
