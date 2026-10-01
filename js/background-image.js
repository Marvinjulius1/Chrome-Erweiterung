/**
 * Background image engine.
 *
 * Rules:
 * - One image per time-slot occurrence ("2026-10-01|dawn"). Opening new tabs
 *   shows the same image until the slot changes or the user asks for another.
 * - A pinned image overrides the automatic rotation until it is unpinned.
 * - Image behavior (settings): "auto" (per time slot, default), "every-tab"
 *   (a new image for each new tab) or "favorites" (rotate saved favorites).
 * - With a personal Unsplash Access Key, new images come from the Unsplash
 *   API; data/images.json is the fallback.
 * - Images are stored in the Cache Storage API, so they show up instantly and
 *   also work offline. The next image is preloaded while the browser is idle.
 */

import { getLocal, setLocal, writeSnapshot } from './storage.js';
import { fetchRandomPhoto, trackDownload } from './unsplash.js';

const CACHE_NAME = 'zenith-images-v1';
// The state is split into three storage keys so that a background write
// (preload plans) can never overwrite a user's change (favorites) made in
// another tab at the same moment.
const STATE_KEY = 'imageState';
const FAVORITES_KEY = 'imageFavorites';
const PLANS_KEY = 'imagePlans';
const API_IMAGES_KEY = 'apiImages';
const MAX_API_IMAGES = 40;

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

let images = [];          // built-in images from data/images.json
let apiImages = [];       // images fetched with the user's Unsplash key
let behavior = { mode: 'auto', apiKey: '' };
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
let requestedId = '';   // the image this tab is currently loading or showing
let displaySeq = 0;     // newest display request wins
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
 * @param {object} opts.behavior   { mode, apiKey }
 */
export async function initBackground({ images: list, config, elements, categories, behavior: b }) {
  images = list.filter((img) => img && img.url && !img.placeholder);
  imageConfig = config;
  els = elements;
  enabledCategories = categories;
  if (b) behavior = { ...behavior, ...b };
  apiImages = await getLocal(API_IMAGES_KEY, []);
  await refresh();
}

/** Updates image behavior and the optional Unsplash key. */
export function setBehavior(b) {
  behavior = { ...behavior, ...b };
}

/**
 * Re-reads the shared state. Several new tabs can be open at once, so every
 * change starts from the stored state instead of this tab's (possibly stale) copy.
 */
async function refresh() {
  const [main, favorites, plans] = await Promise.all([
    getLocal(STATE_KEY, {}),
    getLocal(FAVORITES_KEY, null),
    getLocal(PLANS_KEY, null)
  ]);
  state = {
    ...DEFAULT_STATE,
    ...main,
    favorites: favorites || main.favorites || [],
    upcoming: plans || main.upcoming || {}
  };
  saved = serialize(state);
  // Older versions kept everything in one key: force a write of the split parts.
  if (favorites === null) saved.favorites = '';
  if (plans === null) saved.plans = '';
}

let saved = { main: '', favorites: '', plans: '' };

function serialize(s) {
  const { favorites, upcoming, ...main } = s;
  return { main: JSON.stringify(main), favorites: JSON.stringify(favorites), plans: JSON.stringify(upcoming) };
}

let queue = Promise.resolve();

/**
 * Runs one state change at a time: re-read, apply fn, persist. fn is
 * synchronous, so background preloading and user actions in this tab can
 * never interleave and overwrite each other. Network calls happen outside.
 */
function mutate(fn) {
  const run = queue.then(async () => {
    await refresh();
    const result = fn();
    await persist();
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

/* ---------------- Decisions (synchronous, used inside mutate) ---------------- */

/** The image this slot keeps without choosing anything new, or null. */
function existingChoice(slot, slotKey) {
  const pinned = byId(state.pinnedId);
  if (pinned) return { image: pinned, planned: false };

  const everyTab = behavior.mode === 'every-tab';
  if (state.slotKey === slotKey && !everyTab) {
    const current = byId(state.currentId);
    // In "favorites" mode a non-favorite current image is replaced right away.
    if (current && (!favoritesMode() || state.favorites.includes(current.id))) {
      return { image: current, planned: false };
    }
  }

  // A new slot occurrence (or a new tab in "every-tab" mode): use the image
  // picked and preloaded in advance if possible.
  const planned = byId(state.upcoming[slotKey]) || (everyTab ? byId(state.upcoming.__next) : null);
  if (planned && planned.id !== state.currentId && isEligible(planned, slot)) {
    return { image: planned, planned: true };
  }
  return null;
}

/** A preloaded "next image" for the slot, if it is still a valid choice. */
function plannedNext(slot) {
  const next = byId(state.upcoming.__next);
  return next && next.id !== state.currentId && isEligible(next, slot) ? next : null;
}

/** Records a newly chosen image as current. */
function commitNew(image, slotKey) {
  if (!image) return;
  if (state.upcoming.__next === image.id) delete state.upcoming.__next;
  state.slotKey = slotKey;
  pushHistory(image);
}

/** Drops plans for slots that are over; keeps the ones that are still ahead. */
function prunePlans(nextSlotKey) {
  const plans = {};
  if (byId(state.upcoming.__next)) plans.__next = state.upcoming.__next;
  if (nextSlotKey && byId(state.upcoming[nextSlotKey])) plans[nextSlotKey] = state.upcoming[nextSlotKey];
  state.upcoming = plans;
}

function wantsApi() {
  return !!behavior.apiKey && !favoritesMode();
}

/* ---------------- Public actions ---------------- */

/**
 * Shows the right image for the given slot. Called on load and on slot change.
 * slotEndsAt (ms) tells the snapshot how long this image stays valid.
 */
export async function showForSlot(slot, slotKey, nextSlot, nextSlotKey, slotEndsAt) {
  currentSlot = slot;
  currentSlotKey = slotKey;
  currentSlotEndsAt = slotEndsAt || 0;

  let image = await mutate(() => {
    const existing = existingChoice(slot, slotKey);
    if (existing) {
      if (existing.planned) commitNew(existing.image, slotKey);
      prunePlans(nextSlotKey);
      return existing.image;
    }
    if (wantsApi()) return null; // fetch from the API outside the lock first
    const chosen = pick(slot);
    commitNew(chosen, slotKey);
    prunePlans(nextSlotKey);
    return chosen;
  });

  if (!image) {
    const candidate = await fetchCandidate(slot);
    image = await mutate(() => {
      const existing = existingChoice(slot, slotKey); // another tab may have chosen meanwhile
      if (existing && !existing.planned) return existing.image;
      const chosen = existing ? existing.image : chooseFrom(candidate, slot);
      commitNew(chosen, slotKey);
      prunePlans(nextSlotKey);
      return chosen;
    });
  }

  await display(image);
  scheduleIdle(() => preloadAhead(nextSlot, nextSlotKey));
}

/** Picks a fresh image for the current slot ("New image"). */
export async function newImage() {
  if (!currentSlot) return;
  const slot = currentSlot;
  const choose = (candidate) => {
    const chosen = plannedNext(slot) || chooseFrom(candidate, slot);
    state.pinnedId = '';
    delete state.upcoming.__next;
    commitNew(chosen, currentSlotKey);
    return chosen;
  };

  let image = await mutate(() => (!plannedNext(slot) && wantsApi() ? null : choose(null)));
  if (!image) {
    const candidate = await fetchCandidate(slot);
    image = await mutate(() => choose(candidate));
  }
  await display(image);
  scheduleIdle(() => preloadNextInSlot());
}

/** Goes back in the image history. */
export async function previousImage() {
  const id = await mutate(() => {
    if (state.index <= 0) return null;
    state.pinnedId = '';
    state.index -= 1;
    state.currentId = state.history[state.index];
    state.slotKey = currentSlotKey;
    return state.currentId;
  });
  if (id) await display(byId(id));
}

/** Goes forward in the history, or picks a new image at the end of it. */
export async function nextImage() {
  const id = await mutate(() => {
    if (state.index >= state.history.length - 1) return null;
    state.pinnedId = '';
    state.index += 1;
    state.currentId = state.history[state.index];
    state.slotKey = currentSlotKey;
    return state.currentId;
  });
  if (id) await display(byId(id));
  else await newImage();
}

export async function toggleFavorite() {
  await mutate(() => {
    const id = shownId || state.currentId;
    if (!id) return;
    const set = new Set(state.favorites);
    if (set.has(id)) set.delete(id); else set.add(id);
    state.favorites = [...set];
  });
  notify();
}

export async function togglePin() {
  const id = await mutate(() => {
    const target = shownId || state.currentId;
    state.pinnedId = state.pinnedId === target ? '' : target;
    return target;
  });
  writeSnapshot({ validUntil: snapshotValidity(id) });
  notify();
}

/**
 * Another tab chose a different image (new image, back/forward, slot change):
 * follow it, so all open tabs agree. Not in "every-tab" mode, where each tab
 * deliberately has its own image.
 */
export function followStoredImage(stored) {
  if (behavior.mode === 'every-tab' || !stored) return;
  const id = storedChoice(stored);
  if (!id || id === requestedId) return;
  const image = byId(id);
  if (image) display(image);
}

/** The image a stored state asks for: the pinned one if any, else the current one. */
function storedChoice(stored) {
  return stored.pinnedId && byId(stored.pinnedId) ? stored.pinnedId : stored.currentId;
}

/** After showing an image, make sure no other tab changed the choice meanwhile. */
async function reconcile(id) {
  if (behavior.mode === 'every-tab') return;
  const wanted = storedChoice(await getLocal(STATE_KEY, {}));
  if (wanted && wanted !== id && wanted !== requestedId && byId(wanted)) display(byId(wanted));
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
  if (!id) return null;
  return images.find((img) => img.id === id) || apiImages.find((img) => img.id === id) || null;
}

function favoritesMode() {
  return behavior.mode === 'favorites' && state.favorites.some((id) => byId(id));
}

function matchesCategories(image) {
  if (!enabledCategories || enabledCategories.length === 0) return true;
  return image.categories.some((c) => enabledCategories.includes(c));
}

function isEligible(image, slot) {
  if (favoritesMode()) return state.favorites.includes(image.id);
  if (image.api) return image.slots.includes(slot.id);
  return image.slots.includes(slot.id) && matchesCategories(image);
}

/** Candidate pool for a slot, relaxing filters if they leave nothing. */
function poolFor(slot) {
  if (favoritesMode()) return state.favorites.map(byId).filter(Boolean);
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

/**
 * Network half of choosing a new image: with a personal Unsplash key, fetch a
 * photo from the API. Returns null without a key or on any error, in which
 * case the built-in list is used.
 */
async function fetchCandidate(slot) {
  if (!wantsApi()) return null;
  try {
    const photo = await fetchRandomPhoto(behavior.apiKey, slot.query || slot.label, slot.id);
    await rememberApiImage(photo);
    return photo;
  } catch (err) {
    console.warn('[zenith] Unsplash API unavailable, using built-in images:', err.message);
    return null;
  }
}

/** Synchronous half: the API candidate if usable, otherwise a built-in pick. */
function chooseFrom(candidate, slot, exclude = []) {
  if (candidate && wantsApi() && candidate.id !== state.currentId && !exclude.includes(candidate.id)) {
    return candidate;
  }
  return pick(slot, exclude);
}

/** Stores an API image so it survives reloads; keeps favorites and the pinned image. */
async function rememberApiImage(photo) {
  const stored = await getLocal(API_IMAGES_KEY, []);
  const keep = new Set([state.pinnedId, ...state.favorites, ...state.history]);
  const others = stored.filter((img) => img.id !== photo.id);
  const recent = others.slice(0, MAX_API_IMAGES - 1);
  const protectedOld = others.slice(MAX_API_IMAGES - 1).filter((img) => keep.has(img.id));
  apiImages = [photo, ...recent, ...protectedOld];
  await setLocal(API_IMAGES_KEY, apiImages);
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

/** Writes only the parts of the state that actually changed. */
async function persist() {
  const next = serialize(state);
  const writes = [];
  if (next.main !== saved.main) writes.push(setLocal(STATE_KEY, JSON.parse(next.main)));
  if (next.favorites !== saved.favorites) writes.push(setLocal(FAVORITES_KEY, state.favorites));
  if (next.plans !== saved.plans) writes.push(setLocal(PLANS_KEY, state.upcoming));
  saved = next;
  await Promise.all(writes);
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
    // set() keeps existing parameters (e.g. Unsplash's ixid tracking id).
    const params = url.searchParams;
    if (url.hostname === 'images.unsplash.com') {
      params.set('auto', 'format');
      params.set('fit', 'crop');
      params.set('w', String(width));
      params.set('q', String(quality));
    } else if (url.hostname === 'images.pexels.com') {
      params.set('auto', 'compress');
      params.set('cs', 'tinysrgb');
      params.set('w', String(width));
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
  const all = [...images, ...apiImages];
  const ordered = currentSlot ? [...poolFor(currentSlot), ...all] : all;
  return ordered.find((img) => keys.has(sizedUrl(img))) || null;
}

/** Plans and preloads the next "New image" and the first image of the next slot. */
async function preloadAhead(nextSlot, nextSlotKey) {
  await preloadNextInSlot();
  if (!nextSlot || !nextSlotKey) return;

  const plannedFor = () => (state.pinnedId ? null : byId(state.upcoming[nextSlotKey]));
  let planned = await mutate(() => (state.pinnedId ? 'pinned' : plannedFor()));
  if (planned === 'pinned') return;
  if (!planned) {
    const candidate = await fetchCandidate(nextSlot);
    planned = await mutate(() => {
      const existing = plannedFor();
      if (existing || state.pinnedId) return existing;
      const chosen = chooseFrom(candidate, nextSlot, [state.upcoming.__next]);
      if (chosen) state.upcoming[nextSlotKey] = chosen.id;
      return chosen;
    });
  }
  await preload(planned);
}

async function preloadNextInSlot() {
  if (!currentSlot) return;
  const slot = currentSlot;
  let next = await mutate(() => plannedNext(slot));
  if (!next) {
    const candidate = await fetchCandidate(slot);
    next = await mutate(() => {
      const existing = plannedNext(slot);
      if (existing) return existing;
      const chosen = chooseFrom(candidate, slot);
      if (chosen) state.upcoming.__next = chosen.id;
      return chosen;
    });
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
  if (image.id) requestedId = image.id;
  const seq = ++displaySeq;
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

  // A newer request was made while this one was loading: let it win.
  if (seq !== displaySeq) return;

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
  if (seq !== displaySeq || img.src !== objectUrl) {
    URL.revokeObjectURL(objectUrl);
    return;
  }

  img.classList.add('is-visible');
  els.layers[activeLayer].classList.remove('is-visible');
  if (!performance.getEntriesByName('zenith:image-visible').length) performance.mark('zenith:image-visible');
  document.body.classList.remove('no-image');

  const old = objectUrls.get(activeLayer);
  if (old) setTimeout(() => URL.revokeObjectURL(old), 1200);
  objectUrls.set(nextLayer, objectUrl);
  activeLayer = nextLayer;
  shownUrl = url;
  if (image.id) shownId = image.id;

  if (!silent) {
    reportApiUse(image);
    writeSnapshot({
      // A pinned image stays valid; otherwise only until the slot ends
      // (or not at all when every new tab gets a new image).
      validUntil: snapshotValidity(image.id),
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
    reconcile(image.id);
  }
}

function snapshotValidity(id) {
  if (state.pinnedId && state.pinnedId === id) return 0;
  if (behavior.mode === 'every-tab') return 1;
  return currentSlotEndsAt;
}

/** Unsplash asks API clients to report when a photo is actually used. */
async function reportApiUse(image) {
  if (!image.api || image.tracked) return;
  trackDownload(behavior.apiKey, image.downloadLocation);
  image.tracked = true;
  const stored = await getLocal(API_IMAGES_KEY, []);
  await setLocal(API_IMAGES_KEY, stored.map((img) => (img.id === image.id ? { ...img, tracked: true } : img)));
}

function notify() {
  const info = getImageInfo();
  listeners.forEach((fn) => fn(info));
}
