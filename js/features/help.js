/**
 * Keyboard shortcut help overlay ("?").
 */

let root = null;

export function initHelp(element) {
  root = element;
  root.addEventListener('click', (event) => {
    if (event.target === root) hideHelp();
  });
}

export function isHelpOpen() {
  return !!root && !root.hidden;
}

export function toggleHelp() {
  if (isHelpOpen()) hideHelp();
  else showHelp();
}

export function showHelp() {
  root.hidden = false;
  requestAnimationFrame(() => root.classList.add('is-visible'));
}

export function hideHelp() {
  if (!isHelpOpen()) return;
  root.classList.remove('is-visible');
  setTimeout(() => {
    if (!root.classList.contains('is-visible')) root.hidden = true;
  }, 300);
}
