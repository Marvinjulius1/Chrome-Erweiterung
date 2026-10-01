/**
 * Zenith - entry point for the new tab page.
 *
 * Boot order (kept short so the first frame shows in well under 300 ms):
 *   1. Start loading the last image from the snapshot (cache hit = instant).
 *   2. Load data files + settings in parallel.
 *   3. Render clock and greeting, then fade the content in.
 *   4. Resolve the correct image for the current slot and preload ahead.
 */

import {
  readSnapshot, loadSettings, getSync, setSync, onStorageChange, DEFAULT_SETTINGS
} from './storage.js';
import { getZonedNow, getSlot, getSlotKey, getNextSlot } from './time.js';
import {
  initBackground, showForSlot, showSnapshotImage, onImageChange,
  newImage, previousImage, nextImage, toggleFavorite, togglePin, setCategories, setBehavior
} from './background-image.js';
import { pickGreeting, renderGreeting } from './greeting.js';
import { createClock } from './clock.js';
import { runOnboarding } from './onboarding.js';
import { quoteForDate, createMessageSwitcher } from './quote.js';
import { bindKey } from './shortcuts.js';
import { initPanel, togglePanel } from './panel.js';
import { initSettings, updateSettingsForm, updateNameField } from './settings.js';

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
  greetingShown: false
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
  const [config, greetings, quoteData, imageData, settings, name] = await Promise.all([
    loadJSON('data/config.json'),
    loadJSON('data/greetings.json'),
    loadJSON('data/quotes.json'),
    loadJSON('data/images.json'),
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

  document.body.classList.remove('is-loading');

  if (!app.name) {
    app.name = await runOnboarding(els.onboarding);
    await setSync('name', app.name);
    updateNameField(app.name);
  }
  updateGreeting();
  app.message.scheduleAuto(app.settings);

  onStorageChange(handleStorageChange);
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
  app.dateKey = dateKey;
  app.message.setQuote(quoteForDate(app.quotes, dateKey));
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
  if (area === 'local' && changes.favoriteQuotes) {
    app.message.setFavorites(changes.favoriteQuotes.newValue);
  }
  if (area !== 'sync') return;
  if (changes.settings) {
    const prev = app.settings;
    app.settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
    applySettings();
    updateSettingsForm(app.settings);
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
  bindKey(' ', () => app.message.toggle());
  bindKey('n', () => newImage());
  bindKey('ArrowLeft', () => previousImage());
  bindKey('ArrowRight', () => nextImage());
  bindKey('s', () => togglePanel());
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
