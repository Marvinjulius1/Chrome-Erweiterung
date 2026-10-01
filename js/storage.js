/**
 * Storage helpers.
 *
 * - chrome.storage.sync  -> name + settings (small, synced across devices)
 * - chrome.storage.local -> image state, favorites, todos, notes, stats
 * - localStorage         -> a "snapshot" of what the last tab showed, read
 *                           synchronously so the first frame renders instantly
 */

const SNAPSHOT_KEY = 'zenith:snapshot';

/** Default settings. New keys added here are merged into stored settings. */
export const DEFAULT_SETTINGS = {
  // Clock
  clockStyle: 'digital',        // digital | digital-seconds | analog | flip | word | stacked
  clockPosition: 'above',       // above | below | beside
  hour12: null,                 // null = follow the system locale
  showSeconds: false,
  showDate: false,
  // Time
  timeZone: '',                 // '' = device time zone
  // Images
  categories: ['space', 'mountains', 'nature', 'ocean', 'sunsets', 'fog', 'rain', 'night'],
  imageMode: 'auto',            // auto = one stable image per time slot
  unsplashKey: '',
  // Thought of the day
  quoteAutoSwitch: true,
  quoteDelaySeconds: 10,
  // Focus mode
  focusMinutes: 25,
  breakMinutes: 5,
  focusSound: true,
  // Ambient sound (0-100)
  ambientVolume: 50
};

/** True when running as an extension (false when the page is opened as a plain file). */
const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;

/** Minimal in-memory/localStorage fallback so the page also works outside the extension. */
const fallbackArea = (prefix) => ({
  async get(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    const out = {};
    for (const key of list) {
      const raw = safeLocalGet(prefix + key);
      if (raw !== null) out[key] = JSON.parse(raw);
    }
    return out;
  },
  async set(items) {
    for (const [key, value] of Object.entries(items)) {
      safeLocalSet(prefix + key, JSON.stringify(value));
    }
  }
});

const syncArea = hasChrome ? chrome.storage.sync : fallbackArea('zenith:sync:');
const localArea = hasChrome ? chrome.storage.local : fallbackArea('zenith:local:');

export async function getSync(key, fallback) {
  try {
    const result = await syncArea.get([key]);
    return result[key] === undefined ? fallback : result[key];
  } catch (err) {
    console.warn('[zenith] sync read failed', err);
    return fallback;
  }
}

export async function setSync(key, value) {
  try {
    await syncArea.set({ [key]: value });
  } catch (err) {
    console.warn('[zenith] sync write failed', err);
  }
}

export async function getLocal(key, fallback) {
  try {
    const result = await localArea.get([key]);
    return result[key] === undefined ? fallback : result[key];
  } catch (err) {
    console.warn('[zenith] local read failed', err);
    return fallback;
  }
}

export async function setLocal(key, value) {
  try {
    await localArea.set({ [key]: value });
  } catch (err) {
    console.warn('[zenith] local write failed', err);
  }
}

/** Loads settings and fills in any missing keys from the defaults. */
export async function loadSettings() {
  const stored = await getSync('settings', {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings) {
  await setSync('settings', settings);
}

/**
 * Merges a partial update into the stored settings. Reading first means two
 * open tabs never overwrite each other's changes.
 */
export async function patchSettings(patch) {
  const next = { ...(await loadSettings()), ...patch };
  await saveSettings(next);
  return next;
}

/** Subscribes to changes made in other tabs (or by the panel in this tab). */
export function onStorageChange(callback) {
  if (hasChrome && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => callback(changes, area));
  }
}

/* ---------- Snapshot (synchronous, for the very first frame) ---------- */

export function readSnapshot() {
  const raw = safeLocalGet(SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeSnapshot(patch) {
  const next = { ...(readSnapshot() || {}), ...patch };
  safeLocalSet(SNAPSHOT_KEY, JSON.stringify(next));
}

function safeLocalGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable or full: the snapshot is only an optimization */
  }
}
