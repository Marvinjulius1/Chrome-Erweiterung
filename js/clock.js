/**
 * Clock. Each style is a small renderer with mount() and update(now).
 * Phase 1 ships the digital styles; more styles plug into RENDERERS.
 */

import { resolveHour12, formatDate } from './time.js';

const pad = (n) => String(n).padStart(2, '0');

/** Splits a zoned time into display parts according to the 12h/24h setting. */
export function timeParts(now, hour12) {
  let hours = now.hours;
  let period = '';
  if (hour12) {
    period = hours < 12 ? 'AM' : 'PM';
    hours = hours % 12 || 12;
  }
  return {
    hours: hour12 ? String(hours) : pad(hours),
    minutes: pad(now.minutes),
    seconds: pad(now.seconds),
    period
  };
}

/* ---------------- Digital (minimal + with seconds) ---------------- */

function digitalRenderer({ withSeconds }) {
  let timeEl;
  let periodEl;
  return {
    mount(root) {
      root.innerHTML = '<span class="clock__time"></span><span class="clock__period"></span>';
      timeEl = root.querySelector('.clock__time');
      periodEl = root.querySelector('.clock__period');
    },
    update(now, opts) {
      const p = timeParts(now, opts.hour12);
      const seconds = withSeconds || opts.showSeconds;
      const text = seconds ? `${p.hours}:${p.minutes}:${p.seconds}` : `${p.hours}:${p.minutes}`;
      if (timeEl.textContent !== text) timeEl.textContent = text;
      if (periodEl.textContent !== p.period) periodEl.textContent = p.period;
    }
  };
}

const RENDERERS = {
  digital: () => digitalRenderer({ withSeconds: false }),
  'digital-seconds': () => digitalRenderer({ withSeconds: true })
};

/**
 * Creates a clock inside `container`.
 * @returns {{configure(settings): void, update(now): void}}
 */
export function createClock(container) {
  const face = document.createElement('div');
  const dateEl = document.createElement('div');
  dateEl.className = 'clock__date';
  container.append(face, dateEl);

  let renderer = null;
  let style = '';
  let opts = { hour12: false, showSeconds: false, showDate: false };
  let lastNow = null;

  function configure(settings) {
    opts = {
      hour12: resolveHour12(settings.hour12),
      showSeconds: !!settings.showSeconds,
      showDate: !!settings.showDate
    };
    const nextStyle = RENDERERS[settings.clockStyle] ? settings.clockStyle : 'digital';
    if (nextStyle !== style) {
      style = nextStyle;
      renderer = RENDERERS[style]();
      face.className = `clock__face clock--${style}`;
      renderer.mount(face);
    }
    container.dataset.style = style;
    dateEl.hidden = !opts.showDate;
    if (lastNow) update(lastNow);
  }

  function update(now) {
    lastNow = now;
    if (!renderer) return;
    renderer.update(now, opts);
    if (opts.showDate) {
      const text = formatDate(now);
      if (dateEl.textContent !== text) dateEl.textContent = text;
    }
  }

  return { configure, update };
}
