/**
 * Breathing exercise: one minute, in for 4 s, hold for 2 s, out for 6 s
 * (five calm cycles). A softly scaling circle leads the rhythm.
 */

const PHASES = [
  { cue: 'Breathe in', seconds: 4, className: 'is-in' },
  { cue: 'Hold', seconds: 2, className: 'is-hold' },
  { cue: 'Breathe out', seconds: 6, className: 'is-out' }
];
const TOTAL_SECONDS = 60;

let els = {};
let timers = [];
let countdown = null;
let active = false;

export function initBreathing({ root, cue, left, close }) {
  els = { root, cue, left, circle: root.querySelector('.breathing__circle') };
  close.addEventListener('click', stopBreathing);
}

export function isBreathing() {
  return active;
}

export function startBreathing() {
  if (active) return;
  active = true;
  els.root.hidden = false;
  document.body.classList.add('is-breathing');
  requestAnimationFrame(() => els.root.classList.add('is-visible'));

  const started = Date.now();
  let offset = 0;
  // Schedule every phase of the minute up front.
  while (offset < TOTAL_SECONDS) {
    for (const phase of PHASES) {
      if (offset >= TOTAL_SECONDS) break;
      const at = offset;
      timers.push(setTimeout(() => showPhase(phase), at * 1000));
      offset += phase.seconds;
    }
  }
  timers.push(setTimeout(finish, TOTAL_SECONDS * 1000));

  const tick = () => {
    const remaining = Math.max(0, TOTAL_SECONDS - Math.floor((Date.now() - started) / 1000));
    els.left.textContent = `${remaining}s`;
  };
  tick();
  countdown = setInterval(tick, 250);
}

function showPhase(phase) {
  els.cue.textContent = phase.cue;
  els.circle.style.setProperty('--dur', `${phase.seconds}s`);
  els.circle.classList.remove('is-in', 'is-hold', 'is-out');
  els.circle.classList.add(phase.className);
}

function finish() {
  els.cue.textContent = 'Well done';
  els.left.textContent = '';
  els.circle.classList.remove('is-in', 'is-hold');
  els.circle.classList.add('is-out');
  timers.push(setTimeout(stopBreathing, 1800));
}

export function stopBreathing() {
  if (!active) return;
  active = false;
  timers.forEach(clearTimeout);
  timers = [];
  clearInterval(countdown);
  els.root.classList.remove('is-visible');
  document.body.classList.remove('is-breathing');
  setTimeout(() => {
    if (active) return;
    els.root.hidden = true;
    els.circle.classList.remove('is-in', 'is-hold', 'is-out');
    els.cue.textContent = 'Breathe in';
  }, 600);
}
