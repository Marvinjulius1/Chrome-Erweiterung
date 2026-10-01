/**
 * Greeting: a random line for the current time slot, never the same line
 * twice in a row (remembered across tabs via localStorage).
 */

const LAST_KEY = 'zenith:lastGreeting';

/**
 * @param {object} greetings  data/greetings.json
 * @param {string} slotId
 * @param {string} name
 * @returns {string}
 */
export function pickGreeting(greetings, slotId, name) {
  const lines = (greetings[slotId] || []).filter((line) => typeof line === 'string');
  if (lines.length === 0) return name ? `Hello, ${name}` : 'Hello';

  let last = null;
  try { last = localStorage.getItem(LAST_KEY); } catch { /* ignore */ }

  const candidates = lines.length > 1 ? lines.filter((line) => line !== last) : lines;
  const line = candidates[Math.floor(Math.random() * candidates.length)];

  try { localStorage.setItem(LAST_KEY, line); } catch { /* ignore */ }
  return fillName(line, name);
}

/** Replaces {name}; if no name is set, removes it together with the preceding comma. */
function fillName(line, name) {
  if (name) return line.replace(/\{name\}/g, name);
  return line.replace(/,?\s*\{name\}/g, '').trim();
}

/** Renders the greeting with a soft fade, replacing any previous text. */
export function renderGreeting(element, text) {
  if (element.textContent === text) return;
  element.classList.remove('fade-in');
  // Force a reflow so the animation restarts.
  void element.offsetWidth;
  element.textContent = text;
  element.classList.add('fade-in');
}
