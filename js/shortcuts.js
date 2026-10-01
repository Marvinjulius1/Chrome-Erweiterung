/**
 * Keyboard shortcuts. Keys are ignored while the user is typing in a field,
 * while a modifier key is held, and during onboarding.
 */

const bindings = new Map();

/** Registers a handler for a key (KeyboardEvent.key, case-insensitive for letters). */
export function bindKey(key, handler) {
  bindings.set(key.length === 1 ? key.toLowerCase() : key, handler);
}

function isTyping(target) {
  if (!target || !(target instanceof Element)) return false;
  return !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  if (document.body.classList.contains('is-onboarding') || isTyping(event.target)) return;

  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const handler = bindings.get(key);
  if (!handler) return;

  // Let Space/Enter keep working on focused buttons and links.
  if ((key === ' ' || key === 'Enter') && event.target.closest && event.target.closest('button, a')) return;

  event.preventDefault();
  handler(event);
});

/** The shortcut list shown in the help overlay and in Settings. */
export const SHORTCUTS = [
  [['Space'], 'Greeting / thought of the day (pause in focus)'],
  [['F'], 'Start or end focus mode'],
  [['N'], 'New image'],
  [['←', '→'], 'Previous / next image'],
  [['Z'], 'Zen mode'],
  [['B'], 'Breathing exercise'],
  [['S'], 'Settings'],
  [['?'], 'Show shortcuts'],
  [['Esc'], 'Close / leave']
];

/** Fills a <dl> with the shortcut list. */
export function renderShortcuts(dl) {
  dl.replaceChildren(...SHORTCUTS.map(([keys, label]) => {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    keys.forEach((key, i) => {
      const kbd = document.createElement('kbd');
      kbd.textContent = key;
      if (i > 0) dt.append(' ');
      dt.append(kbd);
    });
    const dd = document.createElement('dd');
    dd.textContent = label;
    row.append(dt, dd);
    return row;
  }));
}
