/**
 * Zenith background service worker.
 *
 * Its only job: finish focus/break phases on time (chrome.alarms), count
 * completed focus sessions and show a notification, even when no new tab
 * is open. The new tab pages only write the timer state; this worker keeps
 * the alarm in sync with it.
 */

import {
  FOCUS_KEY, STATS_KEY, ALARM_NAME, IDLE_STATE,
  remainingMs, advance, addSession, dateKeyIn
} from './js/features/focus-core.js';

async function readState() {
  const { [FOCUS_KEY]: state } = await chrome.storage.local.get(FOCUS_KEY);
  return { ...IDLE_STATE, ...(state || {}) };
}

/** Creates or clears the alarm so it matches the stored timer state. */
async function syncAlarm(state) {
  if (state.phase !== 'idle' && state.running) {
    await chrome.alarms.create(ALARM_NAME, { when: Math.max(Date.now() + 500, state.endsAt) });
  } else {
    await chrome.alarms.clear(ALARM_NAME);
  }
}

function notify(id, title, message) {
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    priority: 1
  });
}

async function onPhaseEnd() {
  const state = await readState();
  if (state.phase === 'idle' || !state.running) return;

  // Alarms can fire slightly early; re-arm instead of finishing too soon.
  if (remainingMs(state) > 1500) {
    await syncAlarm(state);
    return;
  }

  const { state: next, completedFocus } = advance(state);
  const writes = { [FOCUS_KEY]: next };

  if (completedFocus) {
    const { settings = {} } = await chrome.storage.sync.get('settings');
    const { [STATS_KEY]: stats } = await chrome.storage.local.get(STATS_KEY);
    const updated = addSession(stats, dateKeyIn(settings.timeZone || ''));
    writes[STATS_KEY] = updated;
    const today = updated[dateKeyIn(settings.timeZone || '')];
    notify('zenith-focus-done', 'Focus session complete',
      `Well done. Take a ${next.breakMinutes}-minute break. Sessions today: ${today}.`);
  } else {
    notify('zenith-break-done', "Break's over", 'Ready for the next focus session?');
  }

  await chrome.storage.local.set(writes);
  await syncAlarm(next);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) onPhaseEnd();
});

// Any tab that starts, pauses or stops the timer writes the state; follow it.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[FOCUS_KEY]) {
    syncAlarm({ ...IDLE_STATE, ...(changes[FOCUS_KEY].newValue || {}) });
  }
});

// After a browser restart, a phase may already be over.
chrome.runtime.onStartup.addListener(async () => {
  const state = await readState();
  if (state.phase !== 'idle' && state.running && remainingMs(state) <= 0) onPhaseEnd();
  else syncAlarm(state);
});

// Clicking a notification focuses the browser on a new tab.
chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id);
  chrome.tabs.create({});
});
