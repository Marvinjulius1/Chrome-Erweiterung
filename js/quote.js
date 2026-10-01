/**
 * Thought of the Day.
 *
 * - The quote is derived from the date, so it is the same all day in every tab.
 * - The message area cross-fades between the greeting and the quote: after a
 *   delay (configurable), on click, or with a keyboard shortcut.
 * - Quotes can be saved as favorites (chrome.storage.local).
 */

import { getLocal, setLocal } from './storage.js';

const FAVORITES_KEY = 'favoriteQuotes';

function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Picks the quote for a date key ("YYYY-MM-DD"). Walking with a step that is
 * coprime to the list length visits every quote once before any repeats, and
 * spreads neighbouring entries of the file across different days.
 */
export function quoteForDate(quotes, dateKey) {
  const n = quotes.length;
  if (n === 0) return null;
  const [y, m, d] = dateKey.split('-').map(Number);
  const dayNumber = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  let step = Math.max(1, Math.floor(n * 0.618));
  while (gcd(step, n) !== 1) step += 1;
  return quotes[(dayNumber * step) % n];
}

/**
 * Wires up the greeting/quote switch.
 * @param {object} els { message, greeting, quote, quoteText, quoteAuthor, quoteFavorite }
 */
export function createMessageSwitcher(els) {
  let showing = 'greeting';
  let autoTimer = null;
  let current = null;       // the quote shown today
  let favorites = [];

  function show(which) {
    showing = which;
    const quoteVisible = which === 'quote';
    els.greeting.classList.toggle('is-current', !quoteVisible);
    els.quote.classList.toggle('is-current', quoteVisible);
    els.greeting.setAttribute('aria-hidden', String(quoteVisible));
    els.quote.setAttribute('aria-hidden', String(!quoteVisible));
    els.message.dataset.showing = which;
  }

  /** Switches between greeting and quote; a manual switch cancels the timer. */
  function toggle() {
    clearTimeout(autoTimer);
    if (!current) return;
    show(showing === 'quote' ? 'greeting' : 'quote');
  }

  /** Starts (or restarts) the automatic switch from greeting to quote. */
  function scheduleAuto(settings) {
    clearTimeout(autoTimer);
    if (!settings.quoteAutoSwitch || showing !== 'greeting') return;
    const seconds = Math.min(600, Math.max(2, Number(settings.quoteDelaySeconds) || 10));
    autoTimer = setTimeout(() => {
      if (current && showing === 'greeting') show('quote');
    }, seconds * 1000);
  }

  function setQuote(quote) {
    current = quote;
    if (!quote) return;
    els.quoteText.textContent = quote.text;
    els.quoteAuthor.textContent = quote.author || '';
    els.quoteAuthor.hidden = !quote.author;
    renderFavorite();
  }

  function isFavorite(quote) {
    return !!quote && favorites.some((f) => f.text === quote.text);
  }

  function renderFavorite() {
    const active = isFavorite(current);
    const label = active ? 'Remove from favorites' : 'Save to favorites';
    els.quoteFavorite.setAttribute('aria-pressed', String(active));
    els.quoteFavorite.setAttribute('aria-label', label);
    els.quoteFavorite.title = label;
  }

  async function toggleFavorite() {
    if (!current) return;
    favorites = await getLocal(FAVORITES_KEY, []);
    if (isFavorite(current)) {
      favorites = favorites.filter((f) => f.text !== current.text);
    } else {
      favorites = [...favorites, { text: current.text, author: current.author || null, savedAt: Date.now() }];
    }
    await setLocal(FAVORITES_KEY, favorites);
    renderFavorite();
  }

  /** Called when favorites change in another tab. */
  function setFavorites(list) {
    favorites = Array.isArray(list) ? list : [];
    renderFavorite();
  }

  // Clicking the text switches; clicking the heart only toggles the favorite.
  els.message.addEventListener('click', (event) => {
    if (event.target.closest('button, a')) return;
    toggle();
  });
  els.quoteFavorite.addEventListener('click', () => toggleFavorite());

  getLocal(FAVORITES_KEY, []).then(setFavorites);
  show('greeting');

  return { toggle, show, setQuote, scheduleAuto, setFavorites, get showing() { return showing; } };
}
