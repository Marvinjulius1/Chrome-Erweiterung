/**
 * Focus timer core, shared by the new tab page and the background service
 * worker. No DOM access here.
 *
 * State (chrome.storage.local "focusState"):
 *   { phase: 'idle' | 'focus' | 'break',
 *     running: boolean,
 *     endsAt: ms timestamp (while running),
 *     remaining: ms (while paused),
 *     duration: ms of the current phase,
 *     focusMinutes, breakMinutes }
 *
 * The service worker owns phase transitions (via chrome.alarms), so a session
 * finishes and notifies even when no tab is open.
 */

export const FOCUS_KEY = 'focusState';
export const STATS_KEY = 'focusStats';
export const ALARM_NAME = 'zenith-focus';

export const IDLE_STATE = {
  phase: 'idle',
  running: false,
  endsAt: 0,
  remaining: 0,
  duration: 0,
  focusMinutes: 25,
  breakMinutes: 5
};

export function clampMinutes(value, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(180, Math.max(1, n));
}

/** Milliseconds left in the current phase. */
export function remainingMs(state, now = Date.now()) {
  if (state.phase === 'idle') return 0;
  if (!state.running) return Math.max(0, state.remaining);
  return Math.max(0, state.endsAt - now);
}

/** A running phase of the given kind. */
export function startPhase(state, phase, now = Date.now()) {
  const minutes = phase === 'focus' ? state.focusMinutes : state.breakMinutes;
  const duration = minutes * 60000;
  return { ...state, phase, running: true, duration, endsAt: now + duration, remaining: duration };
}

export function pause(state, now = Date.now()) {
  if (!state.running || state.phase === 'idle') return state;
  return { ...state, running: false, remaining: remainingMs(state, now) };
}

export function resume(state, now = Date.now()) {
  if (state.running || state.phase === 'idle') return state;
  return { ...state, running: true, endsAt: now + state.remaining };
}

export function stop(state) {
  return { ...IDLE_STATE, focusMinutes: state.focusMinutes, breakMinutes: state.breakMinutes };
}

/**
 * What happens when a phase ends: focus -> break (and one completed session),
 * break -> idle.
 * @returns {{ state: object, completedFocus: boolean }}
 */
export function advance(state, now = Date.now()) {
  if (state.phase === 'focus') return { state: startPhase(state, 'break', now), completedFocus: true };
  return { state: stop(state), completedFocus: false };
}

/** Local date key (YYYY-MM-DD) in a time zone ('' = device). */
export function dateKeyIn(timeZone, date = new Date()) {
  const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
  if (timeZone) options.timeZone = timeZone;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
}

/** Adds one completed session to today's count; keeps the last 60 days. */
export function addSession(stats, dateKey) {
  const next = { ...(stats || {}), [dateKey]: ((stats || {})[dateKey] || 0) + 1 };
  const keys = Object.keys(next).sort();
  while (keys.length > 60) delete next[keys.shift()];
  return next;
}

/** "24:59" style label. */
export function formatRemaining(ms) {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
