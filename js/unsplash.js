/**
 * Optional Unsplash API support. Only used when the user enters their own
 * Access Key in the settings; without a key Zenith uses data/images.json.
 *
 * Follows the Unsplash API guidelines: images are hotlinked from the returned
 * URLs, the photographer and Unsplash are credited, and the download endpoint
 * is triggered when a photo is used as a background.
 */

const API = 'https://api.unsplash.com';
const TIMEOUT_MS = 6000;

async function request(path, key) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${API}${path}`, {
      headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
      signal: controller.signal,
      credentials: 'omit'
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks an Access Key.
 * @returns {Promise<'ok'|'invalid'|'rate-limited'|'offline'>}
 */
export async function testKey(key) {
  try {
    const response = await request('/photos?per_page=1', key);
    if (response.ok) return 'ok';
    if (response.status === 401) return 'invalid';
    if (response.status === 403 || response.status === 429) return 'rate-limited';
    return 'invalid';
  } catch {
    return 'offline';
  }
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

/**
 * Fetches one random landscape photo for a search query and converts it into
 * the same shape as an entry in data/images.json.
 */
export async function fetchRandomPhoto(key, query, slotId) {
  const params = new URLSearchParams({
    query,
    orientation: 'landscape',
    content_filter: 'high'
  });
  const response = await request(`/photos/random?${params}`, key);
  if (!response.ok) throw new Error(`Unsplash API: HTTP ${response.status}`);
  const photo = await response.json();

  const title = photo.description || photo.alt_description || '';
  const place = photo.location || {};
  const location = place.name || [place.city, place.country].filter(Boolean).join(', ');
  return {
    id: `unsplash-api-${photo.id}`,
    url: photo.urls.raw,
    title: capitalize(title.trim()).slice(0, 90),
    location: location || undefined,
    categories: [],
    slots: [slotId],
    photographer: photo.user.name,
    photographerUrl: photo.user.links.html,
    source: 'Unsplash',
    sourceUrl: photo.links.html,
    license: 'Unsplash License',
    api: true,
    downloadLocation: photo.links.download_location
  };
}

/** Tells Unsplash that a photo was used (required by the API guidelines). */
export function trackDownload(key, downloadLocation) {
  if (!key || !downloadLocation) return;
  fetch(downloadLocation, {
    headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
    credentials: 'omit'
  }).catch(() => {});
}
