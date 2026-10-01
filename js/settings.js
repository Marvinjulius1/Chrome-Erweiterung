/**
 * Settings form inside the panel.
 *
 * Every control writes through patchSettings(); main.js listens to storage
 * changes and applies them, so the page (and every other open tab) updates
 * live: the main clock itself is the live preview, and the style picker shows
 * small live clocks for each style.
 */

import { patchSettings, setSync } from './storage.js';
import { createClock, CLOCK_STYLES } from './clock.js';
import { getZonedNow, isValidTimeZone } from './time.js';
import { onPanelOpen, onPanelClose } from './panel.js';
import { testKey } from './unsplash.js';

const $ = (selector, root = document) => root.querySelector(selector);

let settings = {};
let previews = [];
let previewTimer = null;

/**
 * @param {object} opts
 * @param {object} opts.settings    current settings
 * @param {string} opts.name        current name
 * @param {Array}  opts.categories  categories from data/config.json
 */
export function initSettings({ settings: initial, name, categories }) {
  settings = initial;
  const panel = $('#panel');

  buildClockPicker();
  buildCategories(categories);
  bindGenericControls(panel);
  bindName(name);
  bindTimeZone();
  bindUnsplash();
  render();

  onPanelOpen(() => {
    render();
    startPreviews();
  });
  onPanelClose(stopPreviews);
}

/** Called by main.js when settings change (in this or another tab). */
export function updateSettingsForm(next) {
  settings = next;
  render();
}

export function updateNameField(name) {
  const input = $('#set-name');
  input.defaultValue = name || '';
  if (document.activeElement !== input) input.value = name || '';
}

async function save(patch) {
  settings = { ...settings, ...patch };
  await patchSettings(patch);
}

/* ---------------- Generic controls (data-setting) ---------------- */

function parseValue(input) {
  if (input.type === 'checkbox') return input.checked;
  if (input.type === 'range') return Number(input.value);
  if (input.value === 'null') return null;
  if (input.value === 'true') return true;
  if (input.value === 'false') return false;
  return input.value;
}

function bindGenericControls(root) {
  root.addEventListener('change', (event) => {
    const input = event.target;
    const key = input.dataset && input.dataset.setting;
    if (!key) return;
    save({ [key]: parseValue(input) });
  });

  // Show the delay value while dragging; save when released (change event).
  const range = $('input[data-setting="quoteDelaySeconds"]', root);
  range.addEventListener('input', () => {
    $('#quote-delay-value').textContent = range.value;
  });
}

/** Reflects the current settings in every control. */
function render() {
  document.querySelectorAll('#panel [data-setting]').forEach((input) => {
    const value = settings[input.dataset.setting];
    if (input.type === 'checkbox') input.checked = !!value;
    else if (input.type === 'radio') input.checked = input.value === String(value);
    else if (input.type === 'range') input.value = String(value);
  });
  $('#quote-delay-value').textContent = String(settings.quoteDelaySeconds);
  $('input[data-setting="quoteDelaySeconds"]').disabled = !settings.quoteAutoSwitch;

  document.querySelectorAll('#category-list input').forEach((input) => {
    input.checked = settings.categories.includes(input.value);
  });

  renderTimeZoneLabel();
  previews.forEach((p) => p.clock.configure(previewSettings(p.style)));

  const keyInput = $('#unsplash-key');
  if (document.activeElement !== keyInput) keyInput.value = settings.unsplashKey || '';
}

/* ---------------- Name ---------------- */

function bindName(name) {
  const input = $('#set-name');
  input.value = name || '';
  input.defaultValue = name || '';
  const commit = () => {
    const value = input.value.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (value) setSync('name', value);
    else input.value = input.defaultValue;
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') input.blur();
  });
}

/* ---------------- Clock style picker with live previews ---------------- */

function previewSettings(style) {
  return { ...settings, clockStyle: style, showDate: false };
}

function buildClockPicker() {
  const picker = $('#clock-picker');
  previews = CLOCK_STYLES.map(({ id, label }) => {
    const option = document.createElement('label');
    option.className = 'clock-option';
    option.innerHTML = `
      <input type="radio" name="clockStyle" value="${id}" data-setting="clockStyle">
      <span class="clock-option__preview"><span class="clock clock-preview"></span></span>
      <span class="clock-option__label"></span>`;
    option.querySelector('.clock-option__label').textContent = label;
    picker.append(option);
    const clock = createClock(option.querySelector('.clock-preview'));
    return { style: id, clock };
  });
}

function tickPreviews() {
  const now = getZonedNow(settings.timeZone);
  previews.forEach((p) => p.clock.update(now));
}

function startPreviews() {
  stopPreviews();
  previews.forEach((p) => p.clock.configure(previewSettings(p.style)));
  tickPreviews();
  previewTimer = setInterval(tickPreviews, 1000);
}

function stopPreviews() {
  clearInterval(previewTimer);
  previewTimer = null;
}

/* ---------------- Categories ---------------- */

function buildCategories(categories) {
  const list = $('#category-list');
  for (const { id, label } of categories) {
    const chip = document.createElement('label');
    chip.className = 'chip';
    chip.innerHTML = `<input type="checkbox" value="${id}"><span></span>`;
    chip.querySelector('span').textContent = label;
    list.append(chip);
  }
  list.addEventListener('change', () => {
    const selected = [...list.querySelectorAll('input:checked')].map((input) => input.value);
    // At least one category must stay on; re-check the last one instead of saving none.
    if (selected.length === 0) {
      render();
      return;
    }
    save({ categories: selected });
  });
}

/* ---------------- Time zone combobox ---------------- */

let zones = null;
let activeIndex = -1;
let visibleZones = [];

function deviceZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function offsetLabel(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(new Date());
    return (parts.find((p) => p.type === 'timeZoneName') || {}).value || '';
  } catch {
    return '';
  }
}

function cityOf(timeZone) {
  const parts = timeZone.split('/');
  return parts[parts.length - 1].replace(/_/g, ' ');
}

/** All IANA zones with readable labels (built on first use). */
function allZones() {
  if (zones) return zones;
  let ids = [];
  try {
    ids = Intl.supportedValuesOf('timeZone');
  } catch {
    ids = ['UTC', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney'];
  }
  if (!ids.includes('UTC')) ids = ['UTC', ...ids];
  const device = deviceZone();
  zones = [
    { id: '', city: 'Device time', region: device, offset: offsetLabel(device), search: `device local ${device}`.toLowerCase() },
    ...ids.map((id) => {
      const city = cityOf(id);
      const region = id.includes('/') ? id.split('/').slice(0, -1).join(' / ').replace(/_/g, ' ') : '';
      const offset = offsetLabel(id);
      return { id, city, region, offset, search: `${city} ${region} ${id} ${offset}`.toLowerCase() };
    })
  ];
  return zones;
}

function renderTimeZoneLabel() {
  const zone = settings.timeZone && isValidTimeZone(settings.timeZone) ? settings.timeZone : '';
  const label = zone
    ? `${cityOf(zone)} · ${offsetLabel(zone)}`
    : `Device time · ${cityOf(deviceZone())} · ${offsetLabel(deviceZone())}`;
  $('#tz-current').textContent = `Current: ${label}`;
}

function bindTimeZone() {
  const input = $('#tz-input');
  const list = $('#tz-list');

  function open() {
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    filter();
  }

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  }

  function filter() {
    const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    visibleZones = allZones().filter((z) => terms.every((t) => z.search.includes(t))).slice(0, 80);
    list.replaceChildren(...visibleZones.map((z, i) => {
      const li = document.createElement('li');
      li.id = `tz-option-${i}`;
      li.role = 'option';
      li.className = 'combobox__option';
      li.dataset.index = String(i);
      li.setAttribute('aria-selected', String((settings.timeZone || '') === z.id));
      const city = document.createElement('span');
      city.className = 'combobox__city';
      city.textContent = z.city;
      const meta = document.createElement('span');
      meta.className = 'combobox__meta';
      meta.textContent = [z.region, z.offset].filter(Boolean).join(' · ');
      li.append(city, meta);
      return li;
    }));
    if (visibleZones.length === 0) {
      const li = document.createElement('li');
      li.className = 'combobox__empty';
      li.textContent = 'No matching time zone';
      list.append(li);
    }
    setActive(visibleZones.length ? 0 : -1);
  }

  function setActive(index) {
    activeIndex = index;
    list.querySelectorAll('.combobox__option').forEach((li, i) => li.classList.toggle('is-active', i === index));
    if (index >= 0) {
      input.setAttribute('aria-activedescendant', `tz-option-${index}`);
      list.children[index].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function choose(index) {
    const zone = visibleZones[index];
    if (!zone) return;
    save({ timeZone: zone.id });
    input.value = '';
    close();
    input.blur();
  }

  input.addEventListener('focus', open);
  input.addEventListener('input', open);
  input.addEventListener('blur', () => setTimeout(close, 120));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (list.hidden) open();
      else setActive(Math.min(activeIndex + 1, visibleZones.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key === 'Escape' && !list.hidden) {
      // Close only the list; the panel stays open.
      event.preventDefault();
      close();
    }
  });
  // mousedown (not click) so the choice happens before the input blurs.
  list.addEventListener('mousedown', (event) => {
    const li = event.target.closest('.combobox__option');
    if (!li) return;
    event.preventDefault();
    choose(Number(li.dataset.index));
  });
}

/* ---------------- Unsplash key ---------------- */

const KEY_MESSAGES = {
  ok: 'Key works. New images now come from Unsplash.',
  invalid: 'This key was rejected by Unsplash. Please check it.',
  'rate-limited': 'The key is valid, but its hourly limit is used up. Try again later.',
  offline: 'Could not reach Unsplash. Check your connection.'
};

function bindUnsplash() {
  const input = $('#unsplash-key');
  const button = $('#unsplash-save');
  const status = $('#unsplash-status');

  async function commit() {
    const key = input.value.trim();
    if (!key) {
      await save({ unsplashKey: '' });
      status.textContent = 'Key removed. Zenith uses its built-in photo collection.';
      status.dataset.state = '';
      return;
    }
    button.disabled = true;
    status.textContent = 'Checking key…';
    status.dataset.state = '';
    const result = await testKey(key);
    button.disabled = false;
    status.textContent = KEY_MESSAGES[result];
    status.dataset.state = result === 'ok' ? 'ok' : 'error';
    // Save valid (or temporarily unverifiable) keys; reject only invalid ones.
    if (result !== 'invalid') await save({ unsplashKey: key });
  }

  button.addEventListener('click', commit);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') commit();
  });
}
