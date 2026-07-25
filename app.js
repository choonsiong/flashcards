// Application wiring: view switching, rendering, and event handling.

import * as store from './store.js';
import { filterCards, sortCards, shuffled, SORTS } from './filter.js';
import {
  $,
  toast,
  announce,
  openSheet,
  closeSheet,
  isSheetOpen,
  confirmDialog,
  confirmAction,
} from './ui.js';

// ── View state (not persisted, except the sort preference) ────────────

const SORT_KEY = 'flashcard.sort.v1';

const ui = {
  view: 'list',
  query: '',
  tag: '',
  sort: readSort(),
  expanded: new Set(), // card ids whose details are shown in the list
  editingId: null, // null while adding
  study: { order: [], index: 0, revealed: false, tag: '' },
};

function readSort() {
  try {
    const saved = localStorage.getItem(SORT_KEY);
    return saved && SORTS[saved] ? saved : 'newest';
  } catch {
    return 'newest';
  }
}

function writeSort(key) {
  try {
    localStorage.setItem(SORT_KEY, key);
  } catch {
    /* preference is non-essential */
  }
}

// ── Small helpers ─────────────────────────────────────────────────────

const VIEWS = ['list', 'study', 'data'];

function setView(view) {
  ui.view = view;

  for (const name of VIEWS) {
    const el = $(`#view-${name}`);
    const active = name === view;
    el.classList.toggle('hidden', !active);
    // The study view needs `flex` when visible; the others are block-level.
    if (name === 'study') el.classList.toggle('flex', active);
  }

  for (const btn of document.querySelectorAll('[data-nav]')) {
    const active = btn.dataset.nav === view;
    btn.classList.toggle('nav-btn-active', active);
    btn.setAttribute('aria-current', active ? 'page' : 'false');
  }

  if (view === 'study') startStudy({ keepPosition: true });
  if (view === 'data') renderData();

  window.scrollTo({ top: 0 });
}

function pluralCards(n) {
  return `${n} ${n === 1 ? 'card' : 'cards'}`;
}

function tagChip(label, { active, onClick, count }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = [
    'shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition active:scale-95',
    active
      ? 'border-indigo-600 bg-indigo-600 text-white'
      : 'border-slate-300 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  ].join(' ');
  btn.textContent = count == null ? label : `${label} ${count}`;
  btn.setAttribute('aria-pressed', String(Boolean(active)));
  btn.addEventListener('click', onClick);
  return btn;
}

// ── List view ─────────────────────────────────────────────────────────

function visibleCards() {
  return sortCards(filterCards(store.getCards(), { query: ui.query, tag: ui.tag }), ui.sort);
}

function renderList() {
  const all = store.getCards();
  const cards = visibleCards();

  $('#card-count').textContent = all.length ? pluralCards(all.length) : '';

  renderTagBar();

  const listEl = $('#card-list');
  const hasFilters = Boolean(ui.query || ui.tag);

  $('#empty-none').classList.toggle('hidden', all.length > 0);
  $('#empty-search').classList.toggle('hidden', !(all.length > 0 && cards.length === 0));
  listEl.classList.toggle('hidden', cards.length === 0);

  if (cards.length === 0) {
    listEl.replaceChildren();
    return;
  }

  listEl.replaceChildren(...cards.map(renderCardRow));

  if (hasFilters) announce(`${pluralCards(cards.length)} matching`);
}

function renderTagBar() {
  const bar = $('#tag-bar');
  const tags = store.getAllTags();

  // Hide the bar entirely when there is nothing to filter by.
  if (tags.length === 0) {
    bar.classList.add('hidden');
    bar.classList.remove('flex');
    bar.replaceChildren();
    if (ui.tag) ui.tag = '';
    return;
  }

  bar.classList.remove('hidden');
  bar.classList.add('flex');

  const chips = [
    tagChip('All', {
      active: !ui.tag,
      onClick: () => {
        ui.tag = '';
        renderList();
      },
    }),
    ...tags.map(({ tag, count }) =>
      tagChip(tag, {
        count,
        active: ui.tag.toLowerCase() === tag.toLowerCase(),
        onClick: () => {
          // Tapping the active tag clears the filter.
          ui.tag = ui.tag.toLowerCase() === tag.toLowerCase() ? '' : tag;
          renderList();
        },
      }),
    ),
  ];

  bar.replaceChildren(...chips);
}

function renderCardRow(card) {
  const isOpen = ui.expanded.has(card.id);

  const row = document.createElement('article');
  row.className =
    'overflow-hidden rounded-2xl border border-slate-200 bg-white transition dark:border-slate-800 dark:bg-slate-900';

  // Header: tapping toggles the details.
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'flex w-full items-start gap-3 p-4 text-left';
  toggle.setAttribute('aria-expanded', String(isOpen));

  const front = document.createElement('p');
  // `min-w-0` lets this flex item shrink below its intrinsic content width, and
  // `break-all` handles a single unbroken run of characters with no spaces.
  front.className =
    'min-w-0 flex-1 whitespace-pre-wrap break-words break-all font-medium leading-snug';
  front.textContent = card.front;

  const chevron = document.createElement('svg');
  // SVG created via innerHTML on a namespaced element is fiddly; build it directly.
  const chevronEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevronEl.setAttribute('viewBox', '0 0 20 20');
  chevronEl.setAttribute('fill', 'currentColor');
  chevronEl.setAttribute('aria-hidden', 'true');
  chevronEl.setAttribute(
    'class',
    `mt-0.5 size-5 shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`,
  );
  const chevronPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  chevronPath.setAttribute('fill-rule', 'evenodd');
  chevronPath.setAttribute(
    'd',
    'M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z',
  );
  chevronPath.setAttribute('clip-rule', 'evenodd');
  chevronEl.append(chevronPath);

  toggle.append(front, chevronEl);
  toggle.addEventListener('click', () => {
    if (ui.expanded.has(card.id)) ui.expanded.delete(card.id);
    else ui.expanded.add(card.id);
    renderList();
  });

  row.append(toggle);

  if (isOpen) {
    const body = document.createElement('div');
    body.className = 'border-t border-slate-200 px-4 py-4 dark:border-slate-800';

    if (card.back) {
      const back = document.createElement('p');
      back.className =
        'whitespace-pre-wrap break-words break-all leading-relaxed text-slate-700 dark:text-slate-300';
      back.textContent = card.back;
      body.append(back);
    } else {
      const none = document.createElement('p');
      none.className = 'text-sm italic text-slate-400 dark:text-slate-500';
      none.textContent = 'No details on this card.';
      body.append(none);
    }

    if (card.tags.length) {
      const tagWrap = document.createElement('div');
      tagWrap.className = 'mt-4 flex flex-wrap gap-1.5';
      for (const tag of card.tags) {
        const pill = document.createElement('span');
        pill.className =
          'rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300';
        pill.textContent = tag;
        tagWrap.append(pill);
      }
      body.append(tagWrap);
    }

    const actions = document.createElement('div');
    actions.className = 'mt-4 flex gap-2';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className =
      'min-h-11 flex-1 rounded-xl border border-slate-300 text-sm font-medium transition active:scale-95 dark:border-slate-700';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openEditor(card.id));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className =
      'min-h-11 flex-1 rounded-xl border border-red-300 text-sm font-medium text-red-700 transition active:scale-95 dark:border-red-900/70 dark:text-red-400';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => requestDelete(card.id));

    actions.append(editBtn, deleteBtn);
    body.append(actions);
    row.append(body);
  }

  return row;
}

// ── Editor sheet ──────────────────────────────────────────────────────

function openEditor(id = null) {
  ui.editingId = id;
  const card = id ? store.getCard(id) : null;

  $('#sheet-title').textContent = card ? 'Edit card' : 'Add card';
  $('#field-front').value = card?.front ?? '';
  $('#field-back').value = card?.back ?? '';
  $('#field-tags').value = card?.tags.join(', ') ?? '';
  $('#front-error').classList.add('hidden');

  const deleteBtn = $('#sheet-delete');
  deleteBtn.classList.toggle('hidden', !card);
  deleteBtn.classList.toggle('flex', Boolean(card));

  openSheet({ onClose: closeEditor });

  // Focus the first field, but not on touch keyboards where the sheet
  // animating while the keyboard opens looks jumpy.
  if (window.matchMedia('(pointer: fine)').matches) {
    setTimeout(() => $('#field-front').focus(), 210);
  }
}

function closeEditor() {
  closeSheet();
  ui.editingId = null;
}

function submitEditor(event) {
  event.preventDefault();

  const front = $('#field-front').value.trim();
  const back = $('#field-back').value.trim();
  const tags = store.parseTags($('#field-tags').value);

  if (!front) {
    $('#front-error').classList.remove('hidden');
    $('#field-front').focus();
    return;
  }
  $('#front-error').classList.add('hidden');

  if (ui.editingId) {
    store.updateCard(ui.editingId, { front, back, tags });
    toast('Card updated');
  } else {
    // Clear any filter first: the store mutation below re-renders synchronously,
    // and a stale search or tag would hide the card that was just added.
    if (ui.query) {
      ui.query = '';
      $('#search').value = '';
    }
    ui.tag = '';

    const card = store.addCard({ front, back, tags });
    // Show the new card's details so the save is visibly confirmed. This has to
    // follow addCard (the id does not exist until then), so re-render after it.
    ui.expanded.add(card.id);
    renderList();
    toast('Card added');
  }

  closeEditor();
}

async function requestDelete(id) {
  const card = store.getCard(id);
  if (!card) return;

  const preview = card.front.length > 80 ? `${card.front.slice(0, 80)}…` : card.front;
  const ok = await confirmAction({
    title: 'Delete this card?',
    body: `"${preview}"\n\nThis cannot be undone.`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;

  store.deleteCard(id);
  ui.expanded.delete(id);
  if (isSheetOpen()) closeEditor();
  toast('Card deleted');
}

async function cycleSort() {
  const keys = Object.keys(SORTS);
  const result = await confirmDialog({
    title: 'Sort cards by',
    actions: [
      ...keys.map((key) => ({
        label: SORTS[key].label + (key === ui.sort ? '  ✓' : ''),
        value: key,
        style: key === ui.sort ? 'primary' : 'neutral',
      })),
      { label: 'Cancel', value: null, style: 'neutral' },
    ],
  });
  if (!result) return;
  ui.sort = result;
  writeSort(result);
  renderList();
}

// ── Study view ────────────────────────────────────────────────────────

function studyPool() {
  return filterCards(store.getCards(), { tag: ui.study.tag });
}

/**
 * Rebuild the study queue. `keepPosition` preserves the current card when
 * returning to the view, so switching tabs does not lose your place.
 */
function startStudy({ shuffle = false, keepPosition = false } = {}) {
  const currentId = keepPosition ? ui.study.order[ui.study.index]?.id : null;
  const pool = studyPool();

  ui.study.order = shuffle ? shuffled(pool) : sortCards(pool, 'newest');

  const rediscovered = currentId ? ui.study.order.findIndex((c) => c.id === currentId) : -1;
  ui.study.index = rediscovered >= 0 ? rediscovered : 0;
  if (!keepPosition || rediscovered < 0) ui.study.revealed = false;

  renderStudy();
}

function renderStudy() {
  renderStudyTagBar();

  const { order, index, revealed } = ui.study;
  const card = order[index];

  const hasCards = order.length > 0;
  $('#study-empty').classList.toggle('hidden', hasCards);
  $('#study-card').closest('div').classList.toggle('hidden', !hasCards);

  if (!hasCards) {
    $('#study-progress').textContent = '';
    return;
  }

  $('#study-progress').textContent = `${index + 1} / ${order.length}`;
  $('#study-front').textContent = card.front;

  const backWrap = $('#study-back-wrap');
  backWrap.classList.toggle('hidden', !revealed);
  $('#study-hint').classList.toggle('hidden', revealed);

  if (revealed) {
    $('#study-back').textContent = card.back || 'No details on this card.';
    $('#study-back').classList.toggle('italic', !card.back);
    $('#study-back').classList.toggle('text-slate-400', !card.back);

    const tagWrap = $('#study-tags');
    tagWrap.replaceChildren();
    for (const tag of card.tags) {
      const pill = document.createElement('span');
      pill.className =
        'rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300';
      pill.textContent = tag;
      tagWrap.append(pill);
    }
  }

  $('#study-card').setAttribute(
    'aria-label',
    revealed ? `${card.front}. Details: ${card.back || 'none'}` : `${card.front}. Tap to reveal details.`,
  );

  $('#btn-prev').disabled = index === 0;
  $('#btn-next').disabled = index >= order.length - 1;
}

function renderStudyTagBar() {
  const bar = $('#study-tag-bar');
  const tags = store.getAllTags();

  if (tags.length === 0) {
    bar.classList.add('hidden');
    bar.replaceChildren();
    if (ui.study.tag) ui.study.tag = '';
    return;
  }

  bar.classList.remove('hidden');
  bar.replaceChildren(
    tagChip('All', {
      active: !ui.study.tag,
      onClick: () => {
        ui.study.tag = '';
        startStudy();
      },
    }),
    ...tags.map(({ tag, count }) =>
      tagChip(tag, {
        count,
        active: ui.study.tag.toLowerCase() === tag.toLowerCase(),
        onClick: () => {
          ui.study.tag = ui.study.tag.toLowerCase() === tag.toLowerCase() ? '' : tag;
          startStudy();
        },
      }),
    ),
  );
}

function stepStudy(delta) {
  const next = ui.study.index + delta;
  if (next < 0 || next >= ui.study.order.length) return;
  ui.study.index = next;
  ui.study.revealed = false;
  renderStudy();
}

function toggleReveal() {
  if (ui.study.order.length === 0) return;
  ui.study.revealed = !ui.study.revealed;
  renderStudy();
}

// ── Data view: export / import / clear ────────────────────────────────

function renderData() {
  const cards = store.getCards();
  const tags = store.getAllTags();
  const parts = [pluralCards(cards.length)];
  if (tags.length) parts.push(`${tags.length} ${tags.length === 1 ? 'tag' : 'tags'}`);
  $('#data-summary').textContent = parts.join(' · ');
}

function exportData() {
  const cards = store.getCards();
  if (cards.length === 0) {
    toast('There are no cards to export');
    return;
  }

  const json = JSON.stringify(store.exportPayload(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = store.exportFilename();
  document.body.append(link);
  link.click();
  link.remove();

  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  toast(`Exported ${pluralCards(cards.length)}`);
}

async function handleImportFile(file) {
  if (!file) return;

  let payload;
  try {
    const text = await file.text();
    payload = store.validateImportPayload(JSON.parse(text));
  } catch (err) {
    const message =
      err instanceof SyntaxError
        ? 'That file is not valid JSON, so nothing was imported.'
        : err.message;
    await confirmDialog({
      title: 'Import failed',
      body: message,
      actions: [{ label: 'OK', value: null, style: 'primary' }],
    });
    return;
  }

  const { cards, skipped } = payload;

  if (cards.length === 0) {
    await confirmDialog({
      title: 'Nothing to import',
      body: 'That file contained no usable cards, so your data was left unchanged.',
      actions: [{ label: 'OK', value: null, style: 'primary' }],
    });
    return;
  }

  const existing = store.getCards().length;
  const skipNote = skipped ? `\n\n${skipped} entr${skipped === 1 ? 'y was' : 'ies were'} unreadable and will be skipped.` : '';

  // With an empty library there is no meaningful difference between the two
  // modes, so skip the question entirely.
  let mode = 'merge';
  if (existing > 0) {
    mode = await confirmDialog({
      title: `Import ${pluralCards(cards.length)}`,
      body: `You currently have ${pluralCards(existing)}.${skipNote}\n\nMerge keeps both sets, updating any card that is newer in the file. Replace deletes your current cards first.`,
      actions: [
        { label: 'Merge', value: 'merge', style: 'primary' },
        { label: 'Replace everything', value: 'replace', style: 'danger' },
        { label: 'Cancel', value: null, style: 'neutral' },
      ],
    });
    if (!mode) return;
  }

  if (mode === 'replace') {
    const ok = await confirmAction({
      title: 'Replace all cards?',
      body: `Your ${pluralCards(existing)} will be permanently deleted and replaced with ${pluralCards(cards.length)} from the file.`,
      confirmLabel: 'Replace',
      danger: true,
    });
    if (!ok) return;
  }

  const result = mode === 'replace' ? store.importReplace(cards) : store.importMerge(cards);

  // A leftover filter could hide everything that was just imported.
  ui.query = '';
  ui.tag = '';
  $('#search').value = '';

  const summary =
    mode === 'replace'
      ? `Replaced with ${pluralCards(result.added)}`
      : `Added ${result.added}, updated ${result.updated}, unchanged ${result.unchanged}`;
  toast(summary);
}

async function clearAll() {
  const count = store.getCards().length;
  if (count === 0) {
    toast('There are no cards to delete');
    return;
  }

  const ok = await confirmAction({
    title: 'Delete all cards?',
    body: `All ${pluralCards(count)} will be permanently removed from this browser. This cannot be undone.`,
    confirmLabel: 'Delete everything',
    danger: true,
  });
  if (!ok) return;

  store.deleteAll();
  ui.expanded.clear();
  toast('All cards deleted');
}

// ── Storage warning ───────────────────────────────────────────────────

function renderStorageWarning() {
  const error = store.getStorageError();
  const banner = $('#storage-warning');
  banner.classList.toggle('hidden', !error);
  if (error) $('#storage-warning-text').textContent = error;
}

// ── Re-render on any data change ──────────────────────────────────────

function renderAll() {
  renderStorageWarning();
  renderList();
  if (ui.view === 'study') startStudy({ keepPosition: true });
  if (ui.view === 'data') renderData();
}

// ── Event wiring ──────────────────────────────────────────────────────

function wireEvents() {
  for (const btn of document.querySelectorAll('[data-nav]')) {
    btn.addEventListener('click', () => setView(btn.dataset.nav));
  }

  $('#btn-add').addEventListener('click', () => openEditor());
  $('#empty-add').addEventListener('click', () => openEditor());

  $('#search').addEventListener('input', (event) => {
    ui.query = event.target.value;
    renderList();
  });

  $('#empty-clear').addEventListener('click', () => {
    ui.query = '';
    ui.tag = '';
    $('#search').value = '';
    renderList();
  });

  $('#btn-sort').addEventListener('click', cycleSort);

  // Editor sheet
  $('#card-form').addEventListener('submit', submitEditor);
  $('#sheet-cancel').addEventListener('click', closeEditor);
  $('#sheet-backdrop').addEventListener('click', closeEditor);
  $('#sheet-delete').addEventListener('click', () => {
    if (ui.editingId) requestDelete(ui.editingId);
  });

  // Cmd/Ctrl+Enter saves without reaching for the button on desktop.
  $('#card-form').addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      $('#card-form').requestSubmit();
    }
  });

  // Study
  $('#study-card').addEventListener('click', toggleReveal);
  $('#btn-prev').addEventListener('click', () => stepStudy(-1));
  $('#btn-next').addEventListener('click', () => stepStudy(1));
  $('#btn-shuffle').addEventListener('click', () => {
    startStudy({ shuffle: true });
    toast('Shuffled');
  });

  // Arrow keys for desktop study.
  document.addEventListener('keydown', (event) => {
    if (ui.view !== 'study' || isSheetOpen()) return;
    if (event.target.matches('input, textarea')) return;
    if (event.key === 'ArrowLeft') stepStudy(-1);
    else if (event.key === 'ArrowRight') stepStudy(1);
    else if (event.key === ' ' || event.key === 'Enter') {
      // Let the focused card button handle its own activation.
      if (event.target !== $('#study-card')) {
        event.preventDefault();
        toggleReveal();
      }
    }
  });

  // Data
  $('#btn-export').addEventListener('click', exportData);
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    // Reset so choosing the same file twice still fires a change event.
    event.target.value = '';
    await handleImportFile(file);
  });
  $('#btn-clear').addEventListener('click', clearAll);
}

// ── Boot ──────────────────────────────────────────────────────────────

store.load();
store.subscribe(renderAll);
wireEvents();
setView('list');
renderAll();
