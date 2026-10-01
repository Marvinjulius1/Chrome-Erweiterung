/**
 * Mini to-do: at most five tasks for today. At midnight finished tasks are
 * cleared and open ones carry over to the new day.
 */

import { getLocal, setLocal } from '../storage.js';

const KEY = 'todos';
const MAX_TASKS = 5;

let data = { date: '', items: [] };
let today = '';
let els = {};

export async function initTodo({ list, form, input, hint, dateKey }) {
  els = { list, form, input, hint };
  today = dateKey;
  data = await getLocal(KEY, { date: dateKey, items: [] });
  await rollOver();
  render();

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    add(input.value);
  });

  list.addEventListener('change', (event) => {
    const box = event.target.closest('input[type="checkbox"]');
    if (box) update(box.dataset.id, (item) => ({ ...item, done: box.checked }));
  });

  list.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-remove]');
    if (remove) removeItem(remove.dataset.remove);
  });
}

export async function setTodoDate(dateKey) {
  today = dateKey;
  await rollOver();
  render();
}

export function handleTodoStorage(changes) {
  if (!changes[KEY]) return;
  data = changes[KEY].newValue || { date: today, items: [] };
  render();
}

/** On a new day: drop finished tasks, keep the open ones. */
async function rollOver() {
  if (data.date === today) return;
  data = { date: today, items: (data.items || []).filter((item) => !item.done) };
  await setLocal(KEY, data);
}

async function persist() {
  render();
  await setLocal(KEY, data);
}

function add(text) {
  const value = text.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!value || data.items.length >= MAX_TASKS) return;
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  data = { ...data, items: [...data.items, { id, text: value, done: false }] };
  els.input.value = '';
  persist();
}

function update(id, fn) {
  data = { ...data, items: data.items.map((item) => (item.id === id ? fn(item) : item)) };
  persist();
}

function removeItem(id) {
  data = { ...data, items: data.items.filter((item) => item.id !== id) };
  persist();
}

function render() {
  const items = data.items || [];
  els.list.replaceChildren(...items.map((item) => {
    const li = document.createElement('li');
    li.className = 'todo__item';
    li.classList.toggle('is-done', item.done);

    const label = document.createElement('label');
    label.className = 'todo__label';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = item.done;
    box.dataset.id = item.id;
    const text = document.createElement('span');
    text.textContent = item.text;
    label.append(box, text);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'todo__remove';
    remove.dataset.remove = item.id;
    remove.setAttribute('aria-label', `Remove "${item.text}"`);
    remove.title = 'Remove';
    remove.textContent = '×';

    li.append(label, remove);
    return li;
  }));

  const full = items.length >= MAX_TASKS;
  els.input.disabled = full;
  els.input.placeholder = full ? 'Five is plenty. Finish one first.' : 'Add a task';
  const open = items.filter((item) => !item.done).length;
  els.hint.textContent = items.length === 0
    ? 'Keep it to five. Finished tasks clear at midnight.'
    : open === 0
      ? 'All done. Well played.'
      : `${open} open · ${items.length - open} done`;
}
