/**
 * Quick Links: up to six favorite sites as small monogram icons inside the
 * panel (never on the main page). Stored in chrome.storage.sync.
 * No favicon service is contacted; icons are drawn from the site's initial.
 */

import { getSync, setSync } from '../storage.js';

const KEY = 'links';
const MAX_LINKS = 6;

let links = [];
let editing = false;
let els = {};

export async function initLinks({ container, form, title, url, cancel, error }) {
  els = { container, form, title, url, cancel, error };
  links = await getSync(KEY, []);
  render();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    add();
  });
  cancel.addEventListener('click', closeForm);
  container.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]');
    if (!action) return;
    event.preventDefault();
    if (action.dataset.action === 'add') openForm();
    if (action.dataset.action === 'edit') {
      editing = !editing;
      render();
    }
    if (action.dataset.action === 'remove') remove(action.dataset.id);
  });
}

export function handleLinksStorage(changes) {
  if (!changes[KEY]) return;
  links = changes[KEY].newValue || [];
  render();
}

/** Accepts "example.com" or a full http(s) URL; returns null for anything else. */
export function normalizeUrl(input) {
  let value = input.trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function openForm() {
  els.form.hidden = false;
  els.error.hidden = true;
  els.title.focus();
}

function closeForm() {
  els.form.hidden = true;
  els.form.reset();
  els.error.hidden = true;
}

async function add() {
  const url = normalizeUrl(els.url.value);
  if (!url) {
    els.error.textContent = 'Please enter a valid web address, like example.com.';
    els.error.hidden = false;
    els.url.focus();
    return;
  }
  const host = new URL(url).hostname.replace(/^www\./, '');
  const title = els.title.value.trim().slice(0, 30) || host;
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  links = [...links, { id, title, url }].slice(0, MAX_LINKS);
  closeForm();
  render();
  await setSync(KEY, links);
}

async function remove(id) {
  links = links.filter((link) => link.id !== id);
  if (links.length === 0) editing = false;
  render();
  await setSync(KEY, links);
}

/** A stable soft color per site, so icons are easy to tell apart. */
function hue(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function render() {
  const nodes = links.map((link) => {
    // In edit mode the tile is not a link, so its remove button is not nested in one.
    const a = document.createElement(editing ? 'div' : 'a');
    a.className = 'link';
    a.title = link.title;
    if (!editing) {
      a.href = link.url;
      a.rel = 'noopener noreferrer';
    }
    const icon = document.createElement('span');
    icon.className = 'link__icon';
    icon.textContent = (link.title.trim()[0] || '?').toUpperCase();
    icon.style.setProperty('--hue', String(hue(new URL(link.url).hostname)));
    const label = document.createElement('span');
    label.className = 'link__label';
    label.textContent = link.title;
    a.append(icon, label);
    if (editing) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'link__remove';
      remove.dataset.action = 'remove';
      remove.dataset.id = link.id;
      remove.setAttribute('aria-label', `Remove ${link.title}`);
      remove.textContent = '×';
      a.append(remove);
    }
    return a;
  });

  if (links.length < MAX_LINKS && !editing) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'link link--add';
    add.dataset.action = 'add';
    add.title = 'Add a link';
    add.innerHTML = '<span class="link__icon">+</span><span class="link__label">Add</span>';
    nodes.push(add);
  }

  if (links.length > 0) {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'links__edit';
    edit.dataset.action = 'edit';
    edit.textContent = editing ? 'Done' : 'Edit';
    nodes.push(edit);
  }

  els.container.replaceChildren(...nodes);
  els.container.classList.toggle('is-editing', editing);
}
