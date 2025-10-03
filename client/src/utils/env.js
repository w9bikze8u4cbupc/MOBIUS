/**
 * Gets the REACT_APP_SHOW_TUTORIAL environment variable
 * @returns {boolean} Whether to show the tutorial
 */
export function getShowTutorial() {
  const val = process.env.REACT_APP_SHOW_TUTORIAL;
  if (val === undefined) return false;
  if (val === 'true') return true;
  if (val === 'false') return false;
  return Boolean(val);
}

/**
 * Gets the REACT_APP_DEBUG_TUTORIAL environment variable
 * @returns {boolean} Whether to show tutorial debug logs
 */
export function getDebugTutorial() {
  const val = process.env.REACT_APP_DEBUG_TUTORIAL;
  if (val === undefined) return false;
  if (val === 'true') return true;
  if (val === 'false') return false;
  return Boolean(val);
}