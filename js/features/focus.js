/**
 * Focus Mode (Pomodoro) on the new tab page.
 *
 * While a session runs, every new tab shows only the clock and the timer.
 * The state lives in chrome.storage.local; the background worker finishes
 * phases on time and sends the notification. This module renders the timer,
 * handles the controls and plays the chime in the visible tab.
 */

import { getLocal, setLocal } from '../storage.js';
import { chime } from '../audio.js';
import {
  FOCUS_KEY, STATS_KEY, IDLE_STATE, remainingMs, startPhase, pause, resume, stop,
  clampMinutes, formatRemaining, dateKeyIn
} from './focus-core.js';

const RING_RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

let state = { ...IDLE_STATE };
let stats = {};
let settings = {};
let els = {};
let timer = null;
const changeListeners = new Set();

export async function initFocus({ elements, settings: initial }) {
  els = elements;
  settings = initial;
  els.progress.style.strokeDasharray = String(CIRCUMFERENCE);

  els.pause.addEventListener('click', togglePause);
  els.skip.addEventListener('click', skip);
  els.stop.addEventListener('click', stopFocus);

  [state, stats] = await Promise.all([
    getLocal(FOCUS_KEY, null).then((s) => ({ ...IDLE_STATE, ...(s || {}) })),
    getLocal(STATS_KEY, {})
  ]);
  render();
}

export function setFocusSettings(next) {
  settings = next;
  render();
}

/** Called from main.js when focusState / focusStats change (any tab or the worker). */
export function handleFocusStorage(changes) {
  if (changes[STATS_KEY]) stats = changes[STATS_KEY].newValue || {};
  if (changes[FOCUS_KEY]) {
    const prev = state;
    state = { ...IDLE_STATE, ...(changes[FOCUS_KEY].newValue || {}) };
    // A phase ended on its own (not a button press): play the chime once,
    // in the tab the user is looking at.
    const ended = prev.phase !== 'idle' && prev.running && remainingMs(prev) < 2000 && prev.phase !== state.phase;
    if (ended && settings.focusSound !== false && document.visibilityState === 'visible') chime();
  }
  render();
}

export function isFocusActive() {
  return state.phase !== 'idle';
}

export function onFocusChange(fn) {
  changeListeners.add(fn);
}

/* ---------------- Actions ---------------- */

async function write(next) {
  state = next;
  render();
  await setLocal(FOCUS_KEY, next);
}

export function startFocus() {
  const base = {
    ...IDLE_STATE,
    focusMinutes: clampMinutes(settings.focusMinutes, 25),
    breakMinutes: clampMinutes(settings.breakMinutes, 5)
  };
  return write(startPhase(base, 'focus'));
}

export function stopFocus() {
  return write(stop(state));
}

/** F key: start a session when idle, end it when one is running. */
export function toggleFocus() {
  return isFocusActive() ? stopFocus() : startFocus();
}

export function togglePause() {
  if (!isFocusActive()) return undefined;
  return write(state.running ? pause(state) : resume(state));
}

/** Skips to the next phase: focus -> break (not counted), break -> idle. */
function skip() {
  if (state.phase === 'focus') return write(startPhase(state, 'break'));
  return stopFocus();
}

export function sessionsToday() {
  return stats[dateKeyIn(settings.timeZone || '')] || 0;
}

/* ---------------- Rendering ---------------- */

function render() {
  const active = isFocusActive();
  document.body.classList.toggle('focus-mode', active);
  els.root.hidden = !active;
  els.root.dataset.phase = state.phase;

  clearInterval(timer);
  timer = null;
  if (active) {
    renderTick();
    if (state.running) timer = setInterval(renderTick, 250);
  } else {
    document.title = 'New Tab';
  }

  els.label.textContent = state.phase === 'break' ? 'Break' : 'Focus';
  els.pause.setAttribute('aria-label', state.running ? 'Pause' : 'Resume');
  els.pause.title = state.running ? 'Pause (Space)' : 'Resume (Space)';
  els.pause.dataset.running = String(state.running);
  els.skip.title = state.phase === 'focus' ? 'Skip to break' : 'End break';
  els.skip.setAttribute('aria-label', els.skip.title);

  const count = sessionsToday();
  els.count.textContent = count === 1 ? '1 session today' : `${count} sessions today`;

  changeListeners.forEach((fn) => fn(state));
}

function renderTick() {
  const left = remainingMs(state);
  const progress = state.duration ? 1 - left / state.duration : 0;
  els.time.textContent = formatRemaining(left);
  els.progress.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress))));
  els.root.classList.toggle('is-paused', !state.running);
  // The remaining time in the tab title, so it is visible from other tabs too.
  document.title = state.running
    ? `${formatRemaining(left)} · ${state.phase === 'break' ? 'Break' : 'Focus'}`
    : `Paused · ${state.phase === 'break' ? 'Break' : 'Focus'}`;
}

export function getFocusState() {
  return state;
}

export function formatFocusStatus() {
  if (!isFocusActive()) return '';
  const left = formatRemaining(remainingMs(state));
  const phase = state.phase === 'break' ? 'Break' : 'Focus';
  return state.running ? `${phase} · ${left} left` : `${phase} paused · ${left} left`;
}
