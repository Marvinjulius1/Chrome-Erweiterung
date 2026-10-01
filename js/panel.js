/**
 * The glass panel behind the small corner button, with three tabs
 * (Today, Tools, Settings). Opens with the button (last used tab) or "S"
 * (Settings); closes with Esc, the close button or a click outside.
 */

let panel;
let toggleBtn;
let lastFocus = null;
let suppressNextClick = false;
let tabs = [];
let activeTab = 'today';
const openListeners = new Set();
const closeListeners = new Set();

export function initPanel({ panel: panelEl, toggle, close }) {
  panel = panelEl;
  toggleBtn = toggle;

  toggleBtn.addEventListener('click', () => (isOpen() ? closePanel() : openPanel()));
  close.addEventListener('click', () => closePanel());
  bindTabs();

  // Click outside closes the panel. The click that closes it must not also
  // trigger whatever is underneath (e.g. switching greeting and quote).
  document.addEventListener('pointerdown', (event) => {
    if (!isOpen()) return;
    if (panel.contains(event.target) || toggleBtn.contains(event.target)) return;
    suppressNextClick = true;
    // A drag without a click must not leave the next real click swallowed.
    setTimeout(() => { suppressNextClick = false; }, 600);
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

/* ---------------- Tabs ---------------- */

function bindTabs() {
  tabs = [...panel.querySelectorAll('[role="tab"]')];
  try {
    activeTab = localStorage.getItem('zenith:panelTab') || 'today';
  } catch { /* ignore */ }
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => selectTab(tabName(tab), { focus: false }));
    tab.addEventListener('keydown', (event) => {
      const index = tabs.indexOf(tab);
      let next = null;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
      if (next) {
        event.preventDefault();
        selectTab(tabName(next), { focus: true });
      }
    });
  });
  selectTab(activeTab, { focus: false });
}

function tabName(tab) {
  return tab.id.replace('tab-', '');
}

/** Shows one tab of the panel ("today", "tools" or "settings"). */
export function selectTab(name, { focus = false } = {}) {
  const target = tabs.find((tab) => tabName(tab) === name) || tabs[0];
  activeTab = tabName(target);
  tabs.forEach((tab) => {
    const selected = tab === target;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
  });
  panel.querySelector('.panel__body').scrollTop = 0;
  if (focus) target.focus();
  try {
    localStorage.setItem('zenith:panelTab', activeTab);
  } catch { /* ignore */ }
}

/* ---------------- Open / close ---------------- */

export function openPanel(tab) {
  if (tab) selectTab(tab);
  if (isOpen()) return;
  lastFocus = document.activeElement;
  panel.inert = false;
  panel.classList.add('is-open');
  document.body.classList.add('panel-open');
  toggleBtn.setAttribute('aria-expanded', 'true');
  toggleBtn.setAttribute('aria-label', 'Close menu');
  openListeners.forEach((fn) => fn());
  // Keyboard users start on the active tab.
  requestAnimationFrame(() => panel.querySelector('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true }));
}

export function closePanel({ restoreFocus = true } = {}) {
  if (!isOpen()) return;
  panel.classList.remove('is-open');
  panel.inert = true;
  document.body.classList.remove('panel-open');
  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.setAttribute('aria-label', 'Open menu');
  closeListeners.forEach((fn) => fn());
  if (restoreFocus && lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus({ preventScroll: true });
}

/** "S": opens the Settings tab, or closes the panel if Settings is showing. */
export function togglePanel(tab) {
  if (isOpen() && (!tab || activeTab === tab)) closePanel();
  else openPanel(tab);
}

export function onPanelOpen(fn) {
  openListeners.add(fn);
}

export function onPanelClose(fn) {
  closeListeners.add(fn);
}
