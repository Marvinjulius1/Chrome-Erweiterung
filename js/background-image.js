/**
 * Background image engine.
 *
 * Rules:
 * - One image per time-slot occurrence ("2026-10-01|dawn"). Opening new tabs
 *   shows the same image until the slot changes or the user asks for another.
 * - A pinned image overrides the automatic rotation until it is unpinned.
 * - Images are stored in the Cache Storage API, so they show up instantly and
 *   also work offline. The next image is preloaded while the browser is idle.
 */

import { getLocal, setLocal, writeSnapshot } from './storage.js';

const CACHE_NAME = 'zenith-images-v1';
const STATE_KEY = 'imageState';

const DEFAULT_STATE = {
  slotKey: '',
  currentId: '',
  history: [],        // ids in the order they were shown (for back/forward)
  index: -1,          // position of currentId inside history
  recent: [],         // recently shown ids, avoided when picking a new one
  pinnedId: '',
  favorites: [],
  upcoming: {}        // slotKey -> id, picked ahead of time and preloaded
};

let images = [];
let imageConfig = {};
let state = { ...DEFAULT_STATE };
let enabledCategories = [];
let currentSlot = null;
let currentSlotKey = '';
let currentSlotEndsAt = 0;  // ms timestamp; the snapshot image is only reused before this
let els = {};
let activeLayer = 0;
let shownUrl = '';
let shownId = '';       // the image this tab is displaying
const objectUrls = new Map(); // layer index -> object URL (revoked when replaced)
const listeners = new Set();

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * @param {object} opts
 * @param {Array} opts.images      entries from data/images.json
 * @param {object} opts.config     the "image" section of data/config.json
 * @param {object} opts.elements   { layers: [img, img], root: HTMLElement }
 * @param {string[]} opts.categories enabled category ids
 */
export async function initBackground({ images: list, config, elements, categories }) {
  images = list.filter((img) => img && img.url && !img.placeholder);
  imageConfig = config;
  els = elements;
  enabledCategories = categories;
  await refresh();
}

/**
 * Re-reads the shared state. Several new tabs can be open at once, so every
 * change starts from the stored state instead of this tab's (possibly stale) copy.
 */
async function refresh() {
  state = { ...DEFAULT_STATE, ...(await getLocal(STATE_KEY, {})) };
}

/**
 * Shows the right image for the given slot. Called on load and on slot change.
 * slotEndsAt (ms) tells the snapshot how long this image stays valid.
 */
export async function showForSlot(slot, slotKey, nextSlot, nextSlotKey, slotEndsAt) {
  currentSlot = slot;
  currentSlotKey = slotKey;
  currentSlotEndsAt = slotEndsAt || 0;
  await refresh();

  let image = null;
  if (state.pinnedId) image = byId(state.pinnedId);

  if (!image && state.slotKey === slotKey) image = byId(state.currentId);

  if (!image) {
    // A new slot occurrence: use the image picked (and preloaded) in advance if possible.
    const planned = byId(state.upcoming[slotKey]);
    image = planned && isEligible(planned, slot) ? planned : pick(slot);
    state.slotKey = slotKey;
    pushHistory(image);
  }

  // Drop plans for slots that are over; keep the ones that are still ahead.
  const plans = {};
  if (byId(state.upcoming.__next)) plans.__next = state.upcoming.__next;
  if (nextSlotKey && byId(state.upcoming[nextSlotKey])) plans[nextSlotKey] = state.upcoming[nextSlotKey];
  state.upcoming = plans;
  await persist();
  await display(image);
  scheduleIdle(() => preloadAhead(nextSlot, nextSlotKey));
}

/** Picks a fresh image for the current slot ("New image"). */
export async function newImage() {
  if (!currentSlot) return;
  await refresh();
  state.pinnedId = '';
  const planned = byId(state.upcoming.__next);
  const usable = planned && planned.id !== state.currentId && isEligible(planned, currentSlot);
  const image = usable ? planned : pick(currentSlot);
  delete state.upcoming.__next;
  state.slotKey = currentSlotKey;
  pushHistory(image);
  await persist();
  await display(image);
  scheduleIdle(() => preloadNextInSlot());
}

/** Goes back in the image history. */
export async function previousImage() {
  await refresh();
  if (state.index <= 0) return;
  state.pinnedId = '';
  state.index -= 1;
  state.currentId = state.history[state.index];
  state.slotKey = currentSlotKey;
  await persist();
  await display(byId(state.currentId));
}

/** Goes forward in the history, or picks a new image at the end of it. */
export async function nextImage() {
  await refresh();
  if (state.index < state.history.length - 1) {
    state.pinnedId = '';
    state.index += 1;
    state.currentId = state.history[state.index];
    state.slotKey = currentSlotKey;
    await persist();
    await display(byId(state.currentId));
    return;
  }
  await newImage();
}

export async function toggleFavorite() {
  await refresh();
  const id = shownId || state.currentId;
  if (!id) return;
  const set = new Set(state.favorites);
  if (set.has(id)) set.delete(id); else set.add(id);
  state.favorites = [...set];
  await persist();
  notify();
}

export async function togglePin() {
  await refresh();
  const id = shownId || state.currentId;
  state.pinnedId = state.pinnedId === id ? '' : id;
  await persist();
  writeSnapshot({ validUntil: state.pinnedId ? 0 : currentSlotEndsAt });
  notify();
}

/** Updates the category filter. The current image stays until the user changes it. */
export function setCategories(categories) {
  enabledCategories = categories;
}

export function getImageInfo() {
  const image = byId(shownId || state.currentId);
  return {
    image,
    isFavorite: !!image && state.favorites.includes(image.id),
    isPinned: !!image && state.pinnedId === image.id,
    canGoBack: state.index > 0
  };
}

/** Subscribe to image changes (used to update the credit and buttons). */
export function onImageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Starts loading the image from the last tab before the data files are
 * parsed. This makes the background appear as early as possible.
 */
export function showSnapshotImage(snapshotImage, elements) {
  if (!snapshotImage || !snapshotImage.src) return;
  els = elements;
  display({ ...snapshotImage, url: snapshotImage.src, __sized: true }, { silent: true });
}

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

function byId(id) {
  return id ? images.find((img) => img.id === id) || null : null;
}

function matchesCategories(image) {
  if (!enabledCategories || enabledCategories.length === 0) return true;
  return image.categories.some((c) => enabledCategories.includes(c));
}

function isEligible(image, slot) {
  return image.slots.includes(slot.id) && matchesCategories(image);
}

/** Candidate pool for a slot, relaxing filters if they leave nothing. */
function poolFor(slot) {
  let pool = images.filter((img) => isEligible(img, slot));
  if (pool.length === 0) pool = images.filter(matchesCategories);     // categories over slot
  if (pool.length === 0) pool = images.filter((img) => img.slots.includes(slot.id));
  if (pool.length === 0) pool = images;
  return pool;
}

/** Random pick that avoids the current and recently shown images when possible. */
function pick(slot, exclude = []) {
  const pool = poolFor(slot);
  const avoid = new Set([state.currentId, ...state.recent, ...exclude]);
  let candidates = pool.filter((img) => !avoid.has(img.id));
  if (candidates.length === 0) candidates = pool.filter((img) => img.id !== state.currentId);
  if (candidates.length === 0) candidates = pool;
  return candidates[Math.floor(Math.random() * candidates.length)] || null;
}

function pushHistory(image) {
  if (!image) return;
  const max = imageConfig.historyLength || 20;
  // Navigating back and then choosing a new image drops the "forward" part.
  const history = state.history.slice(0, state.index + 1);
  history.push(image.id);
  state.history = history.slice(-max);
  state.index = state.history.length - 1;
  state.currentId = image.id;
  state.recent = [image.id, ...state.recent.filter((id) => id !== image.id)]
    .slice(0, imageConfig.recentMemory || 12);
}

async function persist() {
  await setLocal(STATE_KEY, state);
}

/* ------------------------------------------------------------------ */
/* URLs, cache and preloading                                          */
/* ------------------------------------------------------------------ */

/** Picks a width bucket that covers the screen without wasting bandwidth. */
function targetWidth() {
  const widths = imageConfig.widths || [1920];
  const needed = Math.round(Math.max(window.screen.width, window.innerWidth) * (window.devicePixelRatio || 1));
  return widths.find((w) => w >= needed) || widths[widths.length - 1];
}

/** Builds a sized URL for known CDNs; other URLs are used unchanged. */
export function sizedUrl(image) {
  if (image.__sized) return image.url;
  const width = targetWidth();
  const quality = imageConfig.quality || 80;
  try {
    const url = new URL(image.url);
    if (url.hostname === 'images.unsplash.com') {
      url.search = `auto=format&fit=crop&w=${width}&q=${quality}`;
    } else if (url.hostname === 'images.pexels.com') {
      url.search = `auto=compress&cs=tinysrgb&w=${width}`;
    }
    return url.toString();
  } catch {
    return image.url;
  }
}

async function openCache() {
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null; // Cache Storage unavailable (e.g. file:// preview)
  }
}

/** Returns a Blob for the URL, from the cache if possible, else from the network. */
async function loadBlob(url) {
  const cache = await openCache();
  if (cache) {
    const hit = await cache.match(url);
    if (hit) return hit.blob();
  }
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (cache) {
    await cache.put(url, response.clone());
    trimCache(cache);
  }
  return response.blob();
}

/** Downloads an image into the cache without displaying it. */
async function preload(image) {
  if (!image) return;
  const url = sizedUrl(image);
  const cache = await openCache();
  if (!cache || (await cache.match(url))) return;
  try {
    const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (response.ok) {
      await cache.put(url, response);
      trimCache(cache);
    }
  } catch {
    /* offline: try again next time */
  }
}

/** Keeps the cache below maxCached entries; never removes favorites or the pinned image. */
async function trimCache(cache) {
  const max = imageConfig.maxCached || 40;
  const keys = await cache.keys();
  if (keys.length <= max) return;
  const keep = new Set(
    [state.currentId, state.pinnedId, ...state.favorites]
      .map(byId).filter(Boolean).map(sizedUrl)
  );
  let excess = keys.length - max;
  for (const request of keys) {           // keys() is in insertion order: oldest first
    if (excess <= 0) break;
    if (keep.has(request.url)) continue;
    await cache.delete(request);
    excess -= 1;
  }
}

/** Finds any cached image (preferring the current slot) to use while offline. */
async function cachedFallback() {
  const cache = await openCache();
  if (!cache) return null;
  const keys = new Set((await cache.keys()).map((r) => r.url));
  const ordered = currentSlot ? [...poolFor(currentSlot), ...images] : images;
  return ordered.find((img) => keys.has(sizedUrl(img))) || null;
}

/** Plans and preloads the next "New image" and the first image of the next slot. */
async function preloadAhead(nextSlot, nextSlotKey) {
  await preloadNextInSlot();
  if (nextSlot && nextSlotKey) {
    await refresh();
    if (state.pinnedId) return;
    let planned = byId(state.upcoming[nextSlotKey]);
    if (!planned) {
      planned = pick(nextSlot, [state.upcoming.__next]);
      if (!planned) return;
      state.upcoming[nextSlotKey] = planned.id;
      await persist();
    }
    await preload(planned);
  }
}

async function preloadNextInSlot() {
  if (!currentSlot) return;
  await refresh();
  let next = byId(state.upcoming.__next);
  if (!next || next.id === state.currentId || !isEligible(next, currentSlot)) {
    next = pick(currentSlot);
    if (!next) return;
    state.upcoming.__next = next.id;
    await persist();
  }
  await preload(next);
}

function scheduleIdle(fn) {
  const run = () => fn().catch(() => {});
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

/** Cross-fades to the given image using the two stacked <img> layers. */
async function display(image, { silent = false } = {}) {
  if (!image || !els.layers) return;
  const url = sizedUrl(image);
  if (url === shownUrl) {
    if (!silent) notify();
    return;
  }

  let blob;
  try {
    blob = await loadBlob(url);
  } catch {
    // Offline and not cached: show another cached image, or the gradient fallback.
    const fallback = silent ? null : await cachedFallback();
    if (fallback && sizedUrl(fallback) !== url) {
      return display(fallback, { silent });
    }
    document.body.classList.add('no-image');
    if (!silent) notify();
    return;
  }

  const objectUrl = URL.createObjectURL(blob);
  const nextLayer = 1 - activeLayer;
  const img = els.layers[nextLayer];

  img.src = objectUrl;
  try {
    await img.decode();
  } catch {
    /* decode() can reject for odd formats; the image still renders */
  }

  // A newer request may have won the race in the meantime.
  if (img.src !== objectUrl) {
    URL.revokeObjectURL(objectUrl);
    return;
  }

  img.classList.add('is-visible');
  els.layers[activeLayer].classList.remove('is-visible');
  document.body.classList.remove('no-image');

  const old = objectUrls.get(activeLayer);
  if (old) setTimeout(() => URL.revokeObjectURL(old), 1200);
  objectUrls.set(nextLayer, objectUrl);
  activeLayer = nextLayer;
  shownUrl = url;
  if (image.id) shownId = image.id;

  if (!silent) {
    writeSnapshot({
      // A pinned image stays valid; otherwise only until the slot ends.
      validUntil: state.pinnedId === image.id ? 0 : currentSlotEndsAt,
      image: {
        id: image.id,
        src: url,
        title: image.title,
        photographer: image.photographer,
        photographerUrl: image.photographerUrl,
        source: image.source,
        sourceUrl: image.sourceUrl
      }
    });
    notify();
  }
}

function notify() {
  const info = getImageInfo();
  listeners.forEach((fn) => fn(info));
}
