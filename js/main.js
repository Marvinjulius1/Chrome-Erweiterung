/**
 * Zenith - entry point for the new tab page.
 *
 * Boot order (kept short so the first frame shows in well under 300 ms):
 *   1. Start loading the last image from the snapshot (cache hit = instant).
 *   2. Load data files + settings in parallel.
 *   3. Render clock and greeting, then fade the content in.
 *   4. Resolve the correct image for the current slot and preload ahead.
 *   5. Load the optional features (dynamic import, after the first render).
 *
 * Focus mode and zen mode are imported statically and set up before the
 * content fades in, so a running session never flashes the greeting.
 */

import {
  readSnapshot, loadSettings, getSync, setSync, onStorageChange, DEFAULT_SETTINGS
} from './storage.js';
import { getZonedNow, getSlot, getSlotKey, getNextSlot } from './time.js';
import {
  initBackground, showForSlot, showSnapshotImage, onImageChange,
  newImage, previousImage, nextImage, toggleFavorite, togglePin, setCategories, setBehavior,
  followStoredImage
} from './background-image.js';
import { pickGreeting, renderGreeting } from './greeting.js';
import { createClock } from './clock.js';
import { runOnboarding } from './onboarding.js';
import { quoteForDate, createMessageSwitcher } from './quote.js';
import { bindKey, renderShortcuts } from './shortcuts.js';
import { initPanel, togglePanel, closePanel, isOpen as isPanelOpen } from './panel.js';
import { initSettings, updateSettingsForm, updateNameField } from './settings.js';
import {
  initFocus, setFocusSettings, handleFocusStorage, isFocusActive, toggleFocus,
  togglePause, onFocusChange, formatFocusStatus
} from './features/focus.js';
import { initZen, toggleZen, exitZen, isZen, handleZenStorage } from './features/zen.js';

/** Feature modules loaded after the first render (see loadFeatures). */
const lazy = {};

const $ = (selector) => document.querySelector(selector);

const els = {
  layers: [...document.querySelectorAll('.bg__img')],
  center: $('#center'),
  clock: $('#clock'),
  message: $('#message'),
  greeting: $('#greeting'),
  quote: $('#quote'),
  quoteText: $('#quote-text'),
  quoteAuthor: $('#quote-author'),
  quoteFavorite: $('#quote-favorite'),
  credit: $('#photo-credit'),
  title: $('#photo-title'),
  btnPrev: $('#img-prev'),
  btnNext: $('#img-next'),
  btnNew: $('#img-new'),
  btnFavorite: $('#img-favorite'),
  btnPin: $('#img-pin'),
  onboarding: $('#onboarding')
};

const app = {
  config: null,
  greetings: {},
  quotes: [],
  dateKey: '',
  message: null,
  settings: { ...DEFAULT_SETTINGS },
  name: '',
  slot: null,
  slotKey: '',
  clock: null,
  greetingShown: false,
  modesReady: false,     // focus + zen (set up before the first render)
  featuresReady: false   // everything loaded lazily
};

/* ---------------- 1. Snapshot: start the image right away ---------------- */

// Only reuse the last image if its time slot has not ended yet (0 = pinned).
const snapshot = readSnapshot();
if (snapshot && snapshot.image && (!snapshot.validUntil || Date.now() < snapshot.validUntil)) {
  showSnapshotImage(snapshot.image, { layers: els.layers });
}

/* ---------------- 2. Load everything else in parallel ---------------- */

async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}

async function boot() {
  const [config, greetings, quoteData, imageData, soundData, settings, name] = await Promise.all([
    loadJSON('data/config.json'),
    loadJSON('data/greetings.json'),
    loadJSON('data/quotes.json'),
    loadJSON('data/images.json'),
    loadJSON('data/sounds.json'),
    loadSettings(),
    getSync('name', '')
  ]);

  app.config = config;
  app.greetings = greetings;
  app.quotes = (quoteData.quotes || []).filter((q) => q && q.text);
  app.settings = settings;
  app.name = name;

  await initBackground({
    images: imageData.images || [],
    config: config.image || {},
    elements: { layers: els.layers },
    categories: settings.categories,
    behavior: { mode: settings.imageMode, apiKey: settings.unsplashKey }
  });

  /* ---------------- 3. First render ---------------- */
  app.clock = createClock(els.clock);
  app.message = createMessageSwitcher(els);
  initPanel({ panel: $('#panel'), toggle: $('#panel-toggle'), close: $('#panel-close') });
  initSettings({ settings: app.settings, name: app.name, categories: config.categories });
  applySettings();
  bindImageControls();
  bindShortcuts();
  startTicking();
  await initModes();

  document.body.classList.remove('is-loading');
  performance.mark('zenith:content-visible');

  if (!app.name) {
    app.name = await runOnboarding(els.onboarding);
    await setSync('name', app.name);
    updateNameField(app.name);
  }
  updateGreeting();
  app.message.scheduleAuto(app.settings);

  onStorageChange(handleStorageChange);

  /* ---------------- 5. Optional features ---------------- */
  await loadFeatures(soundData.sounds || []);
}

/** Focus mode and zen mode: needed for the very first frame. */
async function initModes() {
  await Promise.all([
    initFocus({
      settings: app.settings,
      elements: {
        root: $('#focus'), time: $('#focus-time'), label: $('#focus-label'), progress: $('#focus-progress'),
        pause: $('#focus-pause'), skip: $('#focus-skip'), stop: $('#focus-stop'), count: $('#focus-count')
      }
    }),
    initZen({ toast })
  ]);
  app.modesReady = true;
}

// Tools tab buttons start a mode, so focus is not handed back to the menu
// button (otherwise Space would re-open the menu instead of pausing the timer).
const launch = (fn) => () => {
  closePanel({ restoreFocus: false });
  document.activeElement?.blur();
  fn();
};

/** Everything else is imported only after the first render. */
async function loadFeatures(sounds) {
  const [intention, todo, notes, links, breathing, soundsModule, help] = await Promise.all([
    import('./features/intention.js'),
    import('./features/todo.js'),
    import('./features/notes.js'),
    import('./features/links.js'),
    import('./features/breathing.js'),
    import('./features/sounds.js'),
    import('./features/help.js')
  ]);
  Object.assign(lazy, { intention, todo, notes, links, breathing, sounds: soundsModule, help });

  await Promise.all([
    intention.initIntention({ display: $('#intention'), input: $('#intention-input'), dateKey: app.dateKey }),
    todo.initTodo({ list: $('#todo-list'), form: $('#todo-form'), input: $('#todo-input'), hint: $('#todo-hint'), dateKey: app.dateKey }),
    notes.initNotes({ textarea: $('#notes'), status: $('#notes-status') }),
    links.initLinks({
      container: $('#links'), form: $('#link-form'), title: $('#link-title'), url: $('#link-url'),
      cancel: $('#link-cancel'), error: $('#link-error')
    })
  ]);
  breathing.initBreathing({ root: $('#breathing'), cue: $('#breathing-cue'), left: $('#breathing-left'), close: $('#breathing-close') });
  soundsModule.initSounds({ list: $('#sound-list'), volumeInput: $('#sound-volume'), sounds, settings: app.settings });
  help.initHelp($('#help'));
  renderShortcuts($('#help-list'));
  renderShortcuts($('#settings-shortcuts'));

  $('#focus-start').addEventListener('click', launch(toggleFocus));
  $('#breathing-start').addEventListener('click', launch(breathing.startBreathing));
  onFocusChange(renderFocusStatus);
  renderFocusStatus();
  setInterval(renderFocusStatus, 1000);
  app.featuresReady = true;
}

/** Status line + start/stop button label in the Tools tab. */
function renderFocusStatus() {
  const active = isFocusActive();
  const status = $('#focus-status');
  status.textContent = active ? formatFocusStatus() : '';
  status.hidden = !active;
  $('#focus-start').textContent = active ? 'End focus' : 'Start focus';
}

/* ---------------- Toast ---------------- */

let toastTimer = null;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2200);
}

/* ---------------- Time + slots ---------------- */

/** Runs every second, aligned to the start of each second. */
function startTicking() {
  tick();
  const align = 1000 - (Date.now() % 1000);
  setTimeout(() => {
    tick();
    setInterval(tick, 1000);
  }, align);
}

function tick() {
  const now = getZonedNow(app.settings.timeZone);
  app.clock.update(now);

  if (now.dateKey !== app.dateKey) enterDay(now.dateKey);

  const slot = getSlot(app.config.slots, now);
  const key = getSlotKey(slot, now);
  if (key !== app.slotKey) enterSlot(slot, key, now);
}

/** Called on load and whenever the time slot changes. */
function enterSlot(slot, key, now) {
  app.slot = slot;
  app.slotKey = key;
  document.body.dataset.slot = slot.id;
  showImageForCurrentSlot(now);

  // The greeting changes with the slot; on first load it is rendered after onboarding.
  if (app.greetingShown) updateGreeting();
}

/** A new calendar day (in the selected time zone) brings a new thought of the day. */
function enterDay(dateKey) {
  const isNewDay = !!app.dateKey;
  app.dateKey = dateKey;
  app.message.setQuote(quoteForDate(app.quotes, dateKey));
  // Daily features reset at midnight (they read the date themselves on init).
  if (isNewDay && app.featuresReady) {
    lazy.intention.setIntentionDate(dateKey);
    lazy.todo.setTodoDate(dateKey);
  }
}

/** Resolves the image for the current slot (also after image settings change). */
function showImageForCurrentSlot(now = getZonedNow(app.settings.timeZone)) {
  const next = getNextSlot(app.config.slots, app.slot, now, app.settings.timeZone);
  showForSlot(app.slot, app.slotKey, next.slot, next.key, next.startsAt);
}

function updateGreeting() {
  if (!app.slot) return;
  app.greetingShown = true;
  renderGreeting(els.greeting, pickGreeting(app.greetings, app.slot.id, app.name));
}

/* ---------------- Settings ---------------- */

function applySettings() {
  const s = app.settings;
  app.clock.configure(s);
  els.center.dataset.clockPosition = s.clockPosition;
  setCategories(s.categories);
  setBehavior({ mode: s.imageMode, apiKey: s.unsplashKey });
}

function handleStorageChange(changes, area) {
  if (area === 'local') {
    if (changes.favoriteQuotes) app.message.setFavorites(changes.favoriteQuotes.newValue);
    if (changes.imageState) followStoredImage(changes.imageState.newValue);
    if (app.modesReady) {
      handleFocusStorage(changes);
      handleZenStorage(changes);
    }
    if (app.featuresReady) {
      lazy.intention.handleIntentionStorage(changes);
      lazy.todo.handleTodoStorage(changes);
      lazy.notes.handleNotesStorage(changes);
    }
    return;
  }
  if (area !== 'sync') return;
  if (app.featuresReady) lazy.links.handleLinksStorage(changes);
  if (changes.settings) {
    const prev = app.settings;
    app.settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
    applySettings();
    updateSettingsForm(app.settings);
    if (app.modesReady) setFocusSettings(app.settings);
    if (app.featuresReady) lazy.sounds.setSoundSettings(app.settings);
    app.message.scheduleAuto(app.settings);
    if (prev.timeZone !== app.settings.timeZone) {
      app.slotKey = ''; // re-evaluate the slot in the new time zone
    } else if (prev.imageMode !== app.settings.imageMode || prev.unsplashKey !== app.settings.unsplashKey) {
      showImageForCurrentSlot();
    }
    tick();
  }
  if (changes.name && changes.name.newValue) {
    app.name = changes.name.newValue;
    updateNameField(app.name);
    updateGreeting();
  }
}

/* ---------------- Keyboard ---------------- */

function bindShortcuts() {
  // Space pauses the timer in focus mode, otherwise switches greeting/quote.
  bindKey(' ', () => (app.modesReady && isFocusActive() ? togglePause() : app.message.toggle()));
  bindKey('n', () => newImage());
  bindKey('ArrowLeft', () => previousImage());
  bindKey('ArrowRight', () => nextImage());
  bindKey('s', () => togglePanel('settings'));
  bindKey('f', () => app.modesReady && toggleFocus());
  bindKey('z', () => app.modesReady && toggleZen());
  bindKey('b', () => {
    const b = lazy.breathing;
    if (b) (b.isBreathing() ? b.stopBreathing() : b.startBreathing());
  });
  bindKey('?', () => lazy.help?.toggleHelp());

  // Esc closes the topmost layer: help, breathing, panel (panel.js), then zen mode.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (lazy.help?.isHelpOpen()) lazy.help.hideHelp();
    else if (lazy.breathing?.isBreathing()) lazy.breathing.stopBreathing();
    else if (!isPanelOpen() && app.modesReady && isZen()) exitZen();
    else return;
    event.preventDefault();
  }, true);
}

/* ---------------- Image controls + credit ---------------- */

function bindImageControls() {
  els.btnPrev.addEventListener('click', () => previousImage());
  els.btnNext.addEventListener('click', () => nextImage());
  els.btnNew.addEventListener('click', () => newImage());
  els.btnFavorite.addEventListener('click', () => toggleFavorite());
  els.btnPin.addEventListener('click', () => togglePin());
  onImageChange(renderCredit);
}

/** Unsplash asks for a referral link back to the photographer and to Unsplash. */
function withReferral(url, source) {
  if (source !== 'Unsplash' || !url) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}utm_source=zenith_new_tab&utm_medium=referral`;
}

function link(text, href) {
  const a = document.createElement('a');
  a.textContent = text;
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

function renderCredit(info) {
  const { image } = info;
  els.credit.replaceChildren();
  els.title.textContent = '';
  if (!image) return;

  const sourceHome = image.source === 'Pexels' ? 'https://www.pexels.com' : 'https://unsplash.com';
  els.credit.append(
    'Photo by ',
    link(image.photographer, withReferral(image.photographerUrl, image.source)),
    ' on ',
    link(image.source, withReferral(image.sourceUrl || sourceHome, image.source))
  );
  els.title.textContent = image.title || '';

  els.btnPrev.disabled = !info.canGoBack;
  setToggle(els.btnFavorite, info.isFavorite, 'Remove from favorites', 'Add to favorites');
  setToggle(els.btnPin, info.isPinned, 'Unpin this image', 'Pin this image');
}

function setToggle(button, active, onLabel, offLabel) {
  button.setAttribute('aria-pressed', String(active));
  const label = active ? onLabel : offLabel;
  button.setAttribute('aria-label', label);
  button.title = label;
}

/* ---------------- Pointer activity (subtle UI reveals) ---------------- */

let idleTimer = null;
document.addEventListener('mousemove', () => {
  document.body.classList.add('is-active');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.remove('is-active'), 2500);
}, { passive: true });

boot().catch((err) => {
  console.error('[zenith] boot failed', err);
  document.body.classList.remove('is-loading');
  els.greeting.textContent = 'Something went wrong loading Zenith.';
});
