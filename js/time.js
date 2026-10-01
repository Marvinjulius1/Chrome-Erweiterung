/**
 * Time helpers. Everything time-related (clock, greeting, image slot, daily
 * quote) goes through here so a custom time zone applies everywhere.
 */

const formatterCache = new Map();

/** Returns a cached Intl.DateTimeFormat for the given zone ('' = device zone). */
function partsFormatter(timeZone) {
  const key = timeZone || 'local';
  if (!formatterCache.has(key)) {
    const options = {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      weekday: 'long', hourCycle: 'h23'
    };
    if (timeZone) options.timeZone = timeZone;
    formatterCache.set(key, new Intl.DateTimeFormat('en-US', options));
  }
  return formatterCache.get(key);
}

/** Checks whether a time zone identifier is supported by this browser. */
export function isValidTimeZone(timeZone) {
  if (!timeZone) return true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Wall-clock time in the given zone.
 * @returns {{year:number, month:number, day:number, hours:number, minutes:number,
 *            seconds:number, weekday:string, dateKey:string, date:Date}}
 */
export function getZonedNow(timeZone, date = new Date()) {
  const zone = isValidTimeZone(timeZone) ? timeZone : '';
  const parts = {};
  for (const part of partsFormatter(zone).formatToParts(date)) {
    parts[part.type] = part.value;
  }
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return {
    year,
    month,
    day,
    hours: Number(parts.hour) % 24,
    minutes: Number(parts.minute),
    seconds: Number(parts.second),
    weekday: parts.weekday,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    date
  };
}

/** "HH:MM" -> minutes since midnight. */
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Finds the slot that contains the given time.
 * Slots with end < start wrap past midnight (e.g. 23:00-04:59).
 */
export function getSlot(slots, zonedNow) {
  const now = zonedNow.hours * 60 + zonedNow.minutes;
  for (const slot of slots) {
    const start = toMinutes(slot.start);
    const end = toMinutes(slot.end);
    const inside = start <= end
      ? now >= start && now <= end
      : now >= start || now <= end;
    if (inside) return slot;
  }
  return slots[0];
}

/**
 * A key that identifies one concrete occurrence of a slot. A night slot that
 * started yesterday at 23:00 keeps yesterday's date, so the image stays stable
 * across midnight.
 */
export function getSlotKey(slot, zonedNow) {
  const start = toMinutes(slot.start);
  const end = toMinutes(slot.end);
  const now = zonedNow.hours * 60 + zonedNow.minutes;
  let dateKey = zonedNow.dateKey;
  if (start > end && now <= end) {
    // We are in the part after midnight: the slot began on the previous day.
    const prev = new Date(Date.UTC(zonedNow.year, zonedNow.month - 1, zonedNow.day - 1));
    dateKey = prev.toISOString().slice(0, 10);
  }
  return `${dateKey}|${slot.id}`;
}

/** Resolves the 12h/24h preference: null means "follow the system locale". */
export function resolveHour12(pref) {
  if (pref === true || pref === false) return pref;
  try {
    const cycle = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return cycle === 'h12' || cycle === 'h11';
  } catch {
    return false;
  }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** English long date, e.g. "Thursday, October 1". */
export function formatDate(zonedNow) {
  return `${zonedNow.weekday}, ${MONTHS[zonedNow.month - 1]} ${zonedNow.day}`;
}

/**
 * The slot that follows the current one, its slot key and the timestamp at
 * which it starts. Computed by looking at the moment the current slot ends.
 */
export function getNextSlot(slots, slot, zonedNow, timeZone) {
  const now = zonedNow.hours * 60 + zonedNow.minutes;
  const minutesLeft = ((toMinutes(slot.end) - now + 1440) % 1440) + 1;
  const startMs = zonedNow.date.getTime() + minutesLeft * 60000
    - (zonedNow.seconds * 1000 + zonedNow.date.getMilliseconds());
  const future = getZonedNow(timeZone, new Date(startMs));
  const next = getSlot(slots, future);
  return { slot: next, key: getSlotKey(next, future), startsAt: startMs };
}
