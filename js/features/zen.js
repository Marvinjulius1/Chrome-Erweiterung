/**
 * Zen Mode: hides everything except the image and the clock.
 * Toggled with "Z" (Esc also leaves it). Remembered across tabs.
 */

import { getLocal, setLocal } from '../storage.js';

const KEY = 'zenMode';

let enabled = false;
let showToast = () => {};

export async function initZen({ toast }) {
  showToast = toast;
  apply(await getLocal(KEY, false), { announce: false });
}

export function isZen() {
  return enabled;
}

export async function toggleZen() {
  apply(!enabled, { announce: true });
  await setLocal(KEY, enabled);
}

export async function exitZen() {
  if (!enabled) return;
  apply(false, { announce: true });
  await setLocal(KEY, false);
}

export function handleZenStorage(changes) {
  if (changes[KEY]) apply(!!changes[KEY].newValue, { announce: false });
}

function apply(value, { announce }) {
  enabled = !!value;
  document.body.classList.toggle('zen-mode', enabled);
  if (announce) showToast(enabled ? 'Zen mode · press Z to return' : 'Zen mode off');
}
