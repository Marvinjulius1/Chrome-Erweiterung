/**
 * The glass panel behind the small corner button.
 * Opens with the button or "S"; closes with Esc, the close button or a click
 * anywhere outside the panel.
 */

let panel;
let toggleBtn;
let lastFocus = null;
let suppressNextClick = false;
const openListeners = new Set();
const closeListeners = new Set();

export function initPanel({ panel: panelEl, toggle, close }) {
  panel = panelEl;
  toggleBtn = toggle;

  toggleBtn.addEventListener('click', () => (isOpen() ? closePanel() : openPanel()));
  close.addEventListener('click', () => closePanel());

  // Click outside closes the panel. The click that closes it must not also
  // trigger whatever is underneath (e.g. switching greeting and quote).
  document.addEventListener('pointerdown', (event) => {
    if (!isOpen()) return;
    if (panel.contains(event.target) || toggleBtn.contains(event.target)) return;
    suppressNextClick = true;
    closePanel({ restoreFocus: false });
  }, true);

  document.addEventListener('click', (event) => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    event.stopPropagation();
    event.preventDefault();
  }, true);

  // Esc works even while typing in a panel field.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen() && !event.defaultPrevented) {
      event.preventDefault();
      closePanel();
    }
  });
}

export function isOpen() {
  return !!panel && panel.classList.contains('is-open');
}

export function openPanel() {
  if (isOpen()) return;
  lastFocus = document.activeElement;
  panel.inert = false;
  panel.classList.add('is-open');
  document.body.classList.add('panel-open');
  toggleBtn.setAttribute('aria-expanded', 'true');
  toggleBtn.setAttribute('aria-label', 'Close settings');
  openListeners.forEach((fn) => fn());
  // Focus the panel itself so keyboard users start at the top.
  requestAnimationFrame(() => panel.querySelector('.panel__close, button, input')?.focus({ preventScroll: true }));
}

export function closePanel({ restoreFocus = true } = {}) {
  if (!isOpen()) return;
  panel.classList.remove('is-open');
  panel.inert = true;
  document.body.classList.remove('panel-open');
  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.setAttribute('aria-label', 'Open settings');
  closeListeners.forEach((fn) => fn());
  if (restoreFocus && lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus({ preventScroll: true });
}

export function togglePanel() {
  if (isOpen()) closePanel(); else openPanel();
}

export function onPanelOpen(fn) {
  openListeners.add(fn);
}

export function onPanelClose(fn) {
  closeListeners.add(fn);
}
