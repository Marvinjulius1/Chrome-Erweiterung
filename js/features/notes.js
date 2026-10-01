/**
 * Quick Notes: one small text field, saved locally as you type.
 */

import { getLocal, setLocal } from '../storage.js';

const KEY = 'notes';

let els = {};
let saveTimer = null;

export async function initNotes({ textarea, status }) {
  els = { textarea, status };
  textarea.value = await getLocal(KEY, '');

  textarea.addEventListener('input', () => {
    els.status.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 400);
  });
  textarea.addEventListener('blur', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      save();
    }
  });
}

async function save() {
  saveTimer = null;
  await setLocal(KEY, els.textarea.value);
  els.status.textContent = 'Saved on this device.';
}

/** Notes edited in another tab. */
export function handleNotesStorage(changes) {
  if (!changes[KEY] || document.activeElement === els.textarea) return;
  els.textarea.value = changes[KEY].newValue || '';
}
