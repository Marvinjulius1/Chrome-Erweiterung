/**
 * Clock. Each style is a small renderer with mount(root) and update(now, opts).
 *
 * Styles:
 *   digital          very large, thin digits
 *   digital-seconds  digital with seconds
 *   analog           hands only, no numerals
 *   flip             flip cards
 *   word             English words ("Quarter past three")
 *   stacked          bold typographic hour over minute
 */

import { resolveHour12, formatDate } from './time.js';

export const CLOCK_STYLES = [
  { id: 'digital', label: 'Digital' },
  { id: 'digital-seconds', label: 'Digital + seconds' },
  { id: 'analog', label: 'Analog' },
  { id: 'flip', label: 'Flip' },
  { id: 'word', label: 'Words' },
  { id: 'stacked', label: 'Stacked' }
];

const pad = (n) => String(n).padStart(2, '0');
const SVG_NS = 'http://www.w3.org/2000/svg';

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

/** Sets text only when it changed (avoids needless layout work every second). */
function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
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
      setText(timeEl, seconds ? `${p.hours}:${p.minutes}:${p.seconds}` : `${p.hours}:${p.minutes}`);
      setText(periodEl, p.period);
    }
  };
}

/* ---------------- Analog (hands only) ---------------- */

function analogRenderer() {
  let hourHand;
  let minuteHand;
  let secondHand;

  function hand(className, length, tail) {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', className);
    line.setAttribute('x1', '0');
    line.setAttribute('y1', String(tail));
    line.setAttribute('x2', '0');
    line.setAttribute('y2', String(-length));
    return line;
  }

  return {
    mount(root) {
      root.replaceChildren();
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '-100 -100 200 200');
      svg.setAttribute('class', 'analog');
      svg.setAttribute('aria-hidden', 'true');
      const ring = document.createElementNS(SVG_NS, 'circle');
      ring.setAttribute('class', 'analog__ring');
      ring.setAttribute('r', '96');
      hourHand = hand('analog__hour', 48, 10);
      minuteHand = hand('analog__minute', 76, 12);
      secondHand = hand('analog__second', 84, 18);
      const pin = document.createElementNS(SVG_NS, 'circle');
      pin.setAttribute('class', 'analog__pin');
      pin.setAttribute('r', '4');
      svg.append(ring, hourHand, minuteHand, secondHand, pin);
      root.append(svg);
    },
    update(now, opts) {
      const s = now.seconds;
      const m = now.minutes + s / 60;
      const h = (now.hours % 12) + m / 60;
      hourHand.setAttribute('transform', `rotate(${h * 30})`);
      minuteHand.setAttribute('transform', `rotate(${m * 6})`);
      secondHand.setAttribute('transform', `rotate(${s * 6})`);
      secondHand.style.display = opts.showSeconds ? '' : 'none';
    }
  };
}

/* ---------------- Flip clock ---------------- */

/** One flip card. Shows a two-digit value and flips when it changes. */
function flipCard() {
  const el = document.createElement('div');
  el.className = 'flip';
  el.innerHTML =
    '<div class="flip__half flip__top"><span></span></div>' +
    '<div class="flip__half flip__bottom"><span></span></div>' +
    '<div class="flip__half flip__flap flip__flap--top"><span></span></div>' +
    '<div class="flip__half flip__flap flip__flap--bottom"><span></span></div>';
  const [top, bottom, flapTop, flapBottom] = [...el.querySelectorAll('span')];
  let value = null;
  let timer = null;

  function set(next) {
    if (next === value) return;
    const prev = value;
    value = next;
    if (prev === null) {
      top.textContent = bottom.textContent = next;
      return;
    }
    // Static halves: new value on top, old value at the bottom until the flap lands.
    top.textContent = next;
    bottom.textContent = prev;
    flapTop.textContent = prev;
    flapBottom.textContent = next;
    el.classList.remove('is-flipping');
    void el.offsetWidth; // restart the animation
    el.classList.add('is-flipping');
    clearTimeout(timer);
    timer = setTimeout(() => {
      bottom.textContent = next;
      el.classList.remove('is-flipping');
    }, 620);
  }

  return { el, set };
}

function flipRenderer() {
  let hours;
  let minutes;
  let seconds;
  let periodEl;
  return {
    mount(root) {
      root.replaceChildren();
      hours = flipCard();
      minutes = flipCard();
      seconds = flipCard();
      seconds.el.classList.add('flip--seconds');
      periodEl = document.createElement('span');
      periodEl.className = 'clock__period';
      root.append(hours.el, minutes.el, seconds.el, periodEl);
    },
    update(now, opts) {
      const p = timeParts(now, opts.hour12);
      hours.set(p.hours);
      minutes.set(p.minutes);
      seconds.el.hidden = !opts.showSeconds;
      if (opts.showSeconds) seconds.set(p.seconds);
      setText(periodEl, p.period);
    }
  };
}

/* ---------------- Word clock ---------------- */

const NUMBER_WORDS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven'];

const MINUTE_WORDS = {
  5: 'five', 10: 'ten', 15: 'quarter', 20: 'twenty', 25: 'twenty-five', 30: 'half'
};

/**
 * English time in words, rounded to five minutes, e.g. "Just after quarter
 * past three" or "Almost ten to six". Exact noon and midnight get their names.
 */
export function timeInWords(hours, minutes) {
  const rounded = Math.round(minutes / 5) * 5;
  const diff = minutes - rounded;           // -2..2
  let hour = hours;
  let mins = rounded;
  if (mins === 60) {
    mins = 0;
    hour += 1;
  }

  let phrase;
  if (mins === 0) {
    const h24 = hour % 24;
    if (h24 === 0) phrase = 'midnight';
    else if (h24 === 12) phrase = 'noon';
    else phrase = `${NUMBER_WORDS[h24 % 12]} o'clock`;
  } else if (mins <= 30) {
    phrase = `${MINUTE_WORDS[mins]} past ${NUMBER_WORDS[hour % 12]}`;
  } else {
    phrase = `${MINUTE_WORDS[60 - mins]} to ${NUMBER_WORDS[(hour + 1) % 12]}`;
  }

  let prefix = '';
  if (diff > 0) prefix = 'just after ';
  else if (diff < 0) prefix = 'almost ';
  const text = prefix + phrase;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function wordRenderer() {
  let textEl;
  return {
    mount(root) {
      root.innerHTML = '<span class="clock__words"></span>';
      textEl = root.querySelector('.clock__words');
    },
    update(now) {
      setText(textEl, timeInWords(now.hours, now.minutes));
    }
  };
}

/* ---------------- Stacked (bold typographic) ---------------- */

function stackedRenderer() {
  let hEl;
  let mEl;
  let sEl;
  let periodEl;
  return {
    mount(root) {
      root.innerHTML =
        '<span class="stacked">' +
        '<span class="stacked__h"></span><span class="stacked__m"></span><span class="stacked__s"></span>' +
        '</span><span class="clock__period"></span>';
      hEl = root.querySelector('.stacked__h');
      mEl = root.querySelector('.stacked__m');
      sEl = root.querySelector('.stacked__s');
      periodEl = root.querySelector('.clock__period');
    },
    update(now, opts) {
      const p = timeParts(now, opts.hour12);
      setText(hEl, opts.hour12 ? pad(Number(p.hours)) : p.hours);
      setText(mEl, p.minutes);
      sEl.hidden = !opts.showSeconds;
      if (opts.showSeconds) setText(sEl, p.seconds);
      setText(periodEl, p.period);
    }
  };
}

const RENDERERS = {
  digital: () => digitalRenderer({ withSeconds: false }),
  'digital-seconds': () => digitalRenderer({ withSeconds: true }),
  analog: analogRenderer,
  flip: flipRenderer,
  word: wordRenderer,
  stacked: stackedRenderer
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
    if (opts.showDate) setText(dateEl, formatDate(now));
  }

  return { configure, update };
}
