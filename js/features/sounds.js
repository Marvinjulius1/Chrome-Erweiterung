/**
 * Ambient sound picker in the Tools tab. One sound at a time; click the
 * active one again to stop. Volume is a setting (ambientVolume, 0-100).
 */

import { playAmbient, stopAmbient, setAmbientVolume, currentAmbient } from '../audio.js';

let sounds = [];
let els = {};
let volume = 0.5;

export function initSounds({ list, volumeInput, sounds: available, settings }) {
  sounds = available;
  els = { list, volumeInput };
  volume = toVolume(settings.ambientVolume);

  list.replaceChildren(...sounds.map((sound) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sound';
    button.dataset.id = sound.id;
    button.setAttribute('aria-pressed', 'false');
    button.textContent = sound.label;
    return button;
  }));

  list.addEventListener('click', (event) => {
    const button = event.target.closest('.sound');
    if (button) toggle(button.dataset.id);
  });

  // Live volume while dragging; the value is saved by the settings form on release.
  volumeInput.addEventListener('input', () => {
    volume = toVolume(volumeInput.value);
    setAmbientVolume(volume);
  });
}

export function setSoundSettings(settings) {
  volume = toVolume(settings.ambientVolume);
  setAmbientVolume(volume);
}

/** Plays a sound, or stops it if it is already playing. */
export function toggle(id) {
  if (currentAmbient() === id) {
    stopAmbient();
  } else {
    const sound = sounds.find((s) => s.id === id);
    if (sound) playAmbient(sound, volume);
  }
  render();
}

function toVolume(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n / 100)) * 0.8 : 0.4;
}

function render() {
  const playing = currentAmbient();
  els.list.querySelectorAll('.sound').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.id === playing));
  });
}
