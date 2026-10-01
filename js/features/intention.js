/**
 * Daily Intention: "What's your main focus today?"
 * One line, shown quietly under the clock, cleared at midnight (in the
 * selected time zone). Clicking the line marks it as done.
 */

import { getLocal, setLocal } from '../storage.js';

const KEY = 'intention';

let entry = null;   // { text, date, done }
let today = '';
let els = {};

export async function initIntention({ display, input, dateKey }) {
  els = { display, input };
  today = dateKey;
  entry = await getLocal(KEY, null);
  render();

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    }
  });
  input.addEventListener('change', () => save(input.value));
  display.addEventListener('click', toggleDone);
}

/** New calendar day: yesterday's intention disappears. */
export function setIntentionDate(dateKey) {
  today = dateKey;
  render();
}

export function handleIntentionStorage(changes) {
  if (!changes[KEY]) return;
  entry = changes[KEY].newValue || null;
  render();
}

function current() {
  return entry && entry.date === today && entry.text ? entry : null;
}

async function save(text) {
  const value = text.trim().replace(/\s+/g, ' ').slice(0, 80);
  entry = value ? { text: value, date: today, done: false } : null;
  render();
  await setLocal(KEY, entry);
}

async function toggleDone() {
  const active = current();
  if (!active) return;
  entry = { ...active, done: !active.done };
  render();
  await setLocal(KEY, entry);
}

function render() {
  const active = current();
  els.display.hidden = !active;
  els.display.textContent = active ? active.text : '';
  els.display.classList.toggle('is-done', !!(active && active.done));
  els.display.setAttribute('aria-pressed', String(!!(active && active.done)));
  els.display.title = active && active.done ? 'Done. Click to undo' : 'Click to mark as done';
  if (document.activeElement !== els.input) els.input.value = active ? active.text : '';
}
